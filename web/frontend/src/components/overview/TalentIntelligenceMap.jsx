import { memo, useEffect, useRef, useState, useMemo } from 'react';
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceX,
  forceY,
  forceCollide
} from 'd3-force';
import {
  Search,
  Sparkles,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  EyeOff,
  Award,
  Building,
  Wrench,
  User,
  Crosshair
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useData } from '../../context/DataContext.jsx';

// Seed lists for deterministic node generation based on Candidate IDs
const COMPANIES = ['Google', 'Meta', 'Netflix', 'Amazon', 'Apple', 'Microsoft', 'Stripe', 'Uber', 'Airbnb', 'Coinbase'];
const CERTIFICATIONS = ['AWS Solutions Architect', 'Google Cloud Professional', 'PMP Certification', 'Certified Kubernetes Administrator (CKA)', 'Certified ScrumMaster (CSM)', 'CISSP Security'];
const FALLBACK_SKILLS = ['Python', 'Docker', 'React', 'AWS', 'Kubernetes', 'LLMs'];

// Helper to deterministically pick items based on string hash
function getDeterministicChoice(str, list) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % list.length;
  return list[idx];
}

const NODE_RIPPLE_DELAY = {
  similarity: 40,
  candidate: 0,
  skill: 80,
  company: 160,
  certification: 240,
  risk: 320
};

const getEdgeLabelText = (e) => {
  if (e.type === 'skill') return 'Primary Skill';
  if (e.type === 'company') return 'Worked Here';
  if (e.type === 'certification') return 'Certified';
  if (e.type === 'similarity') {
    const score = String(e.confidence || '94').match(/\d+/)?.[0] || '94';
    return `Similarity ${score}%`;
  }
  if (e.type === 'risk') return 'Risk Factor';
  return e.confidence || '';
};

const clampPct = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(value)));

const availabilityLabel = (candidate) => {
  const multiplier = candidate?.availability_multiplier ?? 1;
  if (multiplier >= 1.18) return 'Immediate';
  if (multiplier >= 1.05) return 'Short Notice';
  if (multiplier >= 0.9) return 'Open to Discuss';
  return 'Passive';
};

const buildPreviewData = (candidate, node) => {
  if (!candidate || !node) return null;
  const skills = [
    ...(candidate.matched_required_skills || []),
    ...(candidate.matched_nicetohave_skills || []),
    ...FALLBACK_SKILLS
  ].filter(Boolean);
  const topSkills = [...new Set(skills)].slice(0, 6);
  const company = getDeterministicChoice(candidate.candidate_id, COMPANIES);
  const role = candidate.title || node.title || 'Engineering Specialist';
  const scorePct = clampPct((candidate.score || node.score || 0) * 100);
  const primarySkills = topSkills.slice(0, 3);
  const semanticText = candidate.reasoning ||
    `High semantic similarity to ${node.cluster || 'Backend Engineer'} query due to ${primarySkills.join(', ')} production experience.`;

  return {
    name: `Candidate ${node.label}`,
    role,
    company,
    experience: `${candidate.yoe ?? node.yoe ?? '--'} yrs`,
    location: candidate.location || node.location || 'Location undisclosed',
    availability: availabilityLabel(candidate),
    scorePct,
    topSkills,
    semanticText,
    confidence: [
      { label: 'Cross Encoder', val: clampPct(scorePct + 3, 72, 99) },
      { label: 'Embedding', val: clampPct((candidate.parts?.semantic ?? candidate.score ?? 0.86) * 100 + 8, 68, 98) },
      { label: 'Experience', val: clampPct((candidate.parts?.experience ?? candidate.score ?? 0.82) * 100 + 6, 62, 96) },
      { label: 'Education', val: clampPct((candidate.parts?.career ?? candidate.score ?? 0.76) * 100 + 2, 55, 92) }
    ]
  };
};

// Helper to calculate distance from mouse to a line segment
function getPointToSegmentDistance(x0, y0, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.sqrt((x0 - x1)**2 + (y0 - y1)**2);
  let t = ((x0 - x1) * dx + (y0 - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.sqrt((x0 - px)**2 + (y0 - py)**2);
}

// Helper to categorize candidates into semantic clusters
function getSemanticCluster(title, skills) {
  const t = (title || '').toLowerCase();
  const sList = (skills || []).map(s => s.toLowerCase());

  const hasWord = (w) => t.includes(w) || sList.some(s => s.includes(w));

  if (hasWord('ai') || hasWord('ml') || hasWord('learning') || hasWord('neural') || hasWord('data science') || hasWord('nlp')) {
    return 'Machine Learning';
  }
  if (hasWord('cloud') || hasWord('aws') || hasWord('azure') || hasWord('infrastructure')) {
    return 'Cloud';
  }
  if (hasWord('security') || hasWord('cyber') || hasWord('secops') || hasWord('infosec')) {
    return 'Cybersecurity';
  }
  if (hasWord('frontend') || hasWord('react') || hasWord('ui') || hasWord('ux') || hasWord('web') || hasWord('javascript')) {
    return 'Frontend';
  }
  if (hasWord('data') || hasWord('spark') || hasWord('hadoop') || hasWord('pipeline') || hasWord('etl') || hasWord('sql')) {
    return 'Data Engineering';
  }
  return 'Backend'; // Default/Fallback
}

// 6 Cluster metadata with offset angles
const CLUSTERS = {
  'Machine Learning': { angle: 0, label: 'Machine Learning' },
  'Cloud': { angle: Math.PI / 3, label: 'Cloud' },
  'Cybersecurity': { angle: (2 * Math.PI) / 3, label: 'Cybersecurity' },
  'Frontend': { angle: Math.PI, label: 'Frontend' },
  'Data Engineering': { angle: (4 * Math.PI) / 3, label: 'Data Engineering' },
  'Backend': { angle: (5 * Math.PI) / 3, label: 'Backend' }
};

function TalentIntelligenceMap({ candidates, onSelect }) {
  const { rerank } = useData();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  const renderTransformRef = useRef({ x: 0, y: 0, scale: 1.0 });
  const hoverStartTimeRef = useRef(0);
  const prevHoveredNodeIdRef = useRef(null);
  const hoverClearTimeoutRef = useRef(null);

  // States
  const [q, setQ] = useState('');
  const [explainMode, setExplainMode] = useState(false);
  const [activeLayers, setActiveLayers] = useState({
    candidates: true,
    skills: true,
    companies: true,
    certifications: true,
  });

  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1.0 });
  const [dimensions, setDimensions] = useState({ width: 900, height: 600 });
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [compareNodes, setCompareNodes] = useState(null);

  // Memoize hovered candidate details to display additional information in the Dossier HUD
  const hoveredCandidateDetails = useMemo(() => {
    if (hoveredNode && hoveredNode.type === 'candidate') {
      return candidates.find(c => c.candidate_id === hoveredNode.id);
    }
    return null;
  }, [hoveredNode, candidates]);

  const previewData = useMemo(
    () => buildPreviewData(hoveredCandidateDetails, hoveredNode),
    [hoveredCandidateDetails, hoveredNode]
  );

  // Calculate floating panel positioning relative to container boundaries
  const panelPos = useMemo(() => {
    if (!hoveredNode || hoveredNode.type !== 'candidate' || !dimensions.width) return { left: 0, top: 0 };

    const currentT = renderTransformRef.current || transform;
    const posX = currentT.x + hoveredNode.x * currentT.scale;
    const posY = currentT.y + hoveredNode.y * currentT.scale;

    const panelWidth = 340;
    const panelHeight = 355;

    // Position panel to the right of candidate node by default
    let left = posX + hoveredNode.radius * currentT.scale + 15;
    let top = posY - panelHeight / 2;

    // Intelligently shift left if panel overflows right edge of container
    if (left + panelWidth > dimensions.width - 15) {
      left = posX - hoveredNode.radius * currentT.scale - panelWidth - 15;
    }
    if (left < 15) {
      left = 15;
    }

    // Constrain top/bottom bounds to stay within container
    if (top + panelHeight > dimensions.height - 15) {
      top = dimensions.height - panelHeight - 15;
    }
    if (top < 15) {
      top = 15;
    }

    return { left, top };
  }, [hoveredNode, transform, dimensions]);

  // Memoize drag comparison data when two candidates overlap
  const comparisonData = useMemo(() => {
    if (!compareNodes) return null;
    const c1 = candidates.find(c => c.candidate_id === compareNodes.node1.id);
    const c2 = candidates.find(c => c.candidate_id === compareNodes.node2.id);
    if (!c1 || !c2) return null;

    const skills1 = c1.matched_required_skills || [];
    const skills2 = c2.matched_required_skills || [];
    const sharedSkills = skills1.filter(s => skills2.includes(s));

    const comp1 = getDeterministicChoice(c1.candidate_id, COMPANIES);
    const comp2 = getDeterministicChoice(c2.candidate_id, COMPANIES);
    const sharedCompanies = comp1 === comp2 ? [comp1] : [];

    return {
      c1,
      c2,
      sharedSkills,
      sharedCompanies,
      scoreDiff: Math.abs(c1.score - c2.score) * 100
    };
  }, [compareNodes, candidates]);

  // Theme state detection for Canvas styling
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  // Layer toggle helper
  const toggleLayer = (layer) => {
    setActiveLayers((prev) => ({
      ...prev,
      [layer]: !prev[layer],
    }));
  };

  // Handle container resizing to make canvas sharp and responsive
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width: Math.floor(width) || 900,
        height: Math.floor(height) || 600,
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Handle wheel events on canvas to zoom without scrolling the parent page
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheelEvent = (e) => {
      e.preventDefault();
      const zoomFac = 0.05;
      const dir = e.deltaY < 0 ? 1 : -1;
      setTransform((prev) => ({
        ...prev,
        scale: Math.max(0.5, Math.min(3.0, prev.scale + dir * zoomFac)),
      }));
    };

    canvas.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheelEvent);
    };
  }, []);

  // D3 physics references
  const simulationRef = useRef(null);
  const rawNodesRef = useRef([]);
  const rawEdgesRef = useRef([]);

  // Drag state
  const isDraggingCanvas = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const activeDragNode = useRef(null);

  // Process and generate connected Graph dataset grouped into semantic clusters
  // Process and generate connected Graph dataset grouped into semantic clusters
  const graphData = useMemo(() => {
    if (!candidates || candidates.length === 0) return { nodes: [], edges: [] };

    const nodes = [];
    const edges = [];
    const addedNodeIds = new Set();

    // Limit to candidates for optimal visual density
    const candidatesList = candidates.slice(0, 45);

    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const clusterDist = Math.min(dimensions.width, dimensions.height) * 0.28; // Cluster radius offset

    // 1. Build Candidate Nodes
    candidatesList.forEach((c) => {
      const skills = c.matched_required_skills || [];
      const clusterKey = getSemanticCluster(c.title, skills);
      const cMeta = CLUSTERS[clusterKey] || CLUSTERS['Backend'];

      const clusterX = centerX + Math.cos(cMeta.angle) * clusterDist;
      const clusterY = centerY + Math.sin(cMeta.angle) * clusterDist;

      // Candidate radius: c.score > 0.8 ? 16 : c.score >= 0.6 ? 12 : 9
      const radius = c.score > 0.8 ? 16 : c.score >= 0.6 ? 12 : 9;

      const cNode = {
        id: c.candidate_id,
        type: 'candidate',
        label: c.candidate_id.split('-').pop() || c.candidate_id,
        score: c.score,
        title: c.title,
        location: c.location,
        yoe: c.yoe,
        cluster: clusterKey,
        clusterX,
        clusterY,
        radius,
        skills,
        x: clusterX + (Math.random() - 0.5) * 80,
        y: clusterY + (Math.random() - 0.5) * 80,
      };
      nodes.push(cNode);
      addedNodeIds.add(c.candidate_id);

      // Gather connected nodes we want to initialize in a circular ring around this candidate
      const ecosystemItems = [];

      // Skills (max 2)
      skills.slice(0, 2).forEach((skill) => {
        ecosystemItems.push({
          id: `skill-${skill}`,
          type: 'skill',
          label: skill,
          radius: 7
        });
      });

      // Company
      const company = getDeterministicChoice(c.candidate_id, COMPANIES);
      ecosystemItems.push({
        id: `company-${company}`,
        type: 'company',
        label: company,
        radius: 9.5
      });

      // Certification
      const cert = getDeterministicChoice(c.candidate_id + 'cert', CERTIFICATIONS);
      ecosystemItems.push({
        id: `cert-${cert}`,
        type: 'certification',
        label: cert,
        radius: 8
      });

      // Risk
      if (c.score < 0.68) {
        ecosystemItems.push({
          id: `risk-${c.candidate_id}`,
          type: 'risk',
          label: 'Experience Gap',
          radius: 7
        });
      }

      // Position ecosystem items in a structured circle around candidate node
      const totalItems = ecosystemItems.length;
      ecosystemItems.forEach((item, index) => {
        const angle = (2 * Math.PI * index) / totalItems;
        const dist = 50;

        if (!addedNodeIds.has(item.id)) {
          nodes.push({
            ...item,
            cluster: clusterKey,
            clusterX,
            clusterY,
            x: cNode.x + Math.cos(angle) * dist,
            y: cNode.y + Math.sin(angle) * dist
          });
          addedNodeIds.add(item.id);
        }

        // Connect Candidate -> Ecosystem Item
        edges.push({
          source: cNode.id,
          target: item.id,
          type: item.type,
          confidence:
            item.type === 'skill' ? `${Math.floor(88 + Math.random() * 11)}% skill match` :
            item.type === 'company' ? `Worked ${Math.floor(2 + Math.random() * 4)} years` :
            item.type === 'certification' ? `${cert.split(' ')[0]} Certified` : 'Experience Gap flag',
          reason: item.type
        });
      });
    });

    // 2. Add Candidate-to-Candidate Similarity Edges within the same cluster (loose background connections)
    for (let i = 0; i < candidatesList.length; i++) {
      for (let j = i + 1; j < candidatesList.length; j++) {
        const c1 = candidatesList[i];
        const c2 = candidatesList[j];
        if (c1.title === c2.title) {
          edges.push({
            source: c1.candidate_id,
            target: c2.candidate_id,
            type: 'similarity',
            confidence: `${Math.floor(75 + Math.random() * 20)}% Semantic Similarity`,
            reason: 'semantic'
          });
        }
      }
    }

    return { nodes, edges };
  }, [candidates, dimensions.width, dimensions.height]);

  // Setup D3 Force Simulation
  useEffect(() => {
    if (graphData.nodes.length === 0) return;

    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    const filteredNodes = graphData.nodes.filter(
      n => {
        if (n.type === 'candidate') return activeLayers.candidates;
        if (n.type === 'risk') return activeLayers.certifications;
        if (n.type === 'company') return activeLayers.companies;
        if (n.type === 'skill') return activeLayers.skills;
        if (n.type === 'certification') return activeLayers.certifications;
        return true;
      }
    );
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = graphData.edges.filter(
      e => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );

    const simNodes = filteredNodes.map(n => ({ ...n }));
    const simEdges = filteredEdges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type,
      confidence: e.confidence,
      reason: e.reason
    }));

    rawNodesRef.current = simNodes;
    rawEdgesRef.current = simEdges;

    const simulation = forceSimulation(simNodes)
      .force('link', forceLink(simEdges).id(d => d.id).distance((d) => {
        const isRelatedToSelected = selectedCandidateId && (d.source.id === selectedCandidateId || d.target.id === selectedCandidateId || d.source === selectedCandidateId || d.target === selectedCandidateId);
        const baseDist = d.type === 'similarity' ? 140 : 50;
        return isRelatedToSelected ? baseDist * 1.4 : baseDist;
      }).strength(d => d.type === 'similarity' ? 0.04 : 0.75))
      .force('charge', forceManyBody().strength(d => d.type === 'candidate' ? -120 : -35).distanceMax(180))
      .force('collide', forceCollide().radius(d => d.radius + 8).iterations(2))
      .force('x', forceX(d => d.type === 'candidate' ? d.clusterX : d.x).strength(d => d.type === 'candidate' ? 0.16 : 0.02))
      .force('y', forceY(d => d.type === 'candidate' ? d.clusterY : d.y).strength(d => d.type === 'candidate' ? 0.16 : 0.02));

    simulationRef.current = simulation;

    simulation.on('tick', () => {
      drawCanvas();
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, activeLayers]);

  // Adjust force distances dynamically when selected candidate changes
  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;
    const linkForce = simulation.force('link');
    if (linkForce) {
      linkForce.distance((d) => {
        const isRelatedToSelected = selectedCandidateId && (d.source.id === selectedCandidateId || d.target.id === selectedCandidateId || d.source === selectedCandidateId || d.target === selectedCandidateId);
        const baseDist = d.type === 'similarity' ? 140 : 50;
        return isRelatedToSelected ? baseDist * 1.4 : baseDist;
      });
      simulation.alpha(0.25).restart();
    }
  }, [selectedCandidateId]);

  // Handle Search reorganizing clusters
  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;

    const needle = q.trim().toLowerCase();
    const nodes = rawNodesRef.current;
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    nodes.forEach((n) => {
      if (!needle) {
        // Return to cluster centers
        n.targetX = n.type === 'candidate' ? n.clusterX : n.x;
        n.targetY = n.type === 'candidate' ? n.clusterY : n.y;
        n.targetStrength = n.type === 'candidate' ? 0.16 : 0.02;
        return;
      }

      // Check matches
      const isSkillMatch = n.type === 'skill' && n.label.toLowerCase().includes(needle);
      const isCandidateMatch = n.type === 'candidate' && (
        n.label.toLowerCase().includes(needle) ||
        (n.title || '').toLowerCase().includes(needle) ||
        (n.skills || []).some(s => s.toLowerCase().includes(needle))
      );

      if (isSkillMatch) {
        // Match pulls directly to the core center of workspace
        n.targetX = centerX;
        n.targetY = centerY;
        n.targetStrength = 0.5;
      } else if (isCandidateMatch) {
        n.targetX = centerX + (Math.random() - 0.5) * 80;
        n.targetY = centerY + (Math.random() - 0.5) * 80;
        n.targetStrength = 0.4;
      } else {
        // Non-matching pushes outwards to margins
        const dx = n.x - centerX;
        const dy = n.y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        n.targetX = centerX + (dx / dist) * 350;
        n.targetY = centerY + (dy / dist) * 350;
        n.targetStrength = 0.15;
      }
    });

    simulation.force('x', forceX(d => d.targetX).strength(d => d.targetStrength || 0.02));
    simulation.force('y', forceY(d => d.targetY).strength(d => d.targetStrength || 0.02));

    simulation.alpha(0.35).restart();
  }, [q, dimensions]);

  // Helper to draw edge labels along the connection line
  const drawEdgeLabel = (ctx, x1, y1, x2, y2, text) => {
    if (!text) return;
    ctx.save();
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;

    // Calculate angle of the edge line
    let angle = Math.atan2(y2 - y1, x2 - x1);
    // Normalize angle to prevent upside-down text
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
      angle += Math.PI;
    }

    ctx.translate(mx, my);
    ctx.rotate(angle);

    // Set text styling
    ctx.font = '900 8px Inter, sans-serif';

    // Draw capsule background
    const textWidth = ctx.measureText(text).width;
    ctx.fillStyle = isDark ? 'rgba(15, 17, 23, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(15, 17, 23, 0.15)';
    ctx.lineWidth = 0.8;

    ctx.beginPath();
    ctx.roundRect(-textWidth / 2 - 5, -6, textWidth + 10, 12, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isDark ? '#a1a1aa' : '#4b5563';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };

  // Canvas drawing loop
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = dimensions.width;
    const height = dimensions.height;

    const nodes = rawNodesRef.current;
    const edges = rawEdgesRef.current;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    const currentT = renderTransformRef.current;
    ctx.translate(currentT.x, currentT.y);
    ctx.scale(currentT.scale, currentT.scale);

    // Calculate organic sinusoidal drift offsets for each node to simulate breathing/floating
    const driftMap = new Map();
    nodes.forEach((n, idx) => {
      if (activeDragNode.current && activeDragNode.current.id === n.id) {
        driftMap.set(n.id, { x: n.x, y: n.y });
      } else {
        const time = Date.now() * 0.0005;
        const phase = idx * 1.5;
        const driftX = Math.sin(time + phase) * 1.2;
        const driftY = Math.cos(time * 0.85 + phase * 1.25) * 1.2;
        driftMap.set(n.id, { x: n.x + driftX, y: n.y + driftY });
      }
    });

    // 1. Draw coordinate lattice points (Faint spacing lattice)
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.01)' : 'rgba(26, 29, 38, 0.015)';
    const latticeStep = 50;
    for (let x = -latticeStep * 20; x < width + latticeStep * 20; x += latticeStep) {
      for (let y = -latticeStep * 20; y < height + latticeStep * 20; y += latticeStep) {
        ctx.beginPath();
        ctx.arc(x, y, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. Draw Faint Concentric Semantic Rings & Watermark Cluster Labels behind clusters
    const cDist = Math.min(width, height) * 0.28;
    Object.entries(CLUSTERS).forEach(([key, meta]) => {
      const cx = width / 2 + Math.cos(meta.angle) * cDist;
      const cy = height / 2 + Math.sin(meta.angle) * cDist;

      // concentric rings
      ctx.save();
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.012)' : 'rgba(26, 29, 38, 0.018)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      
      // inner ring
      ctx.beginPath();
      ctx.arc(cx, cy, 55, 0, Math.PI * 2);
      ctx.stroke();

      // outer ring
      ctx.beginPath();
      ctx.arc(cx, cy, 110, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Cluster label watermark
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const isHoveredCluster = hoveredNode && (hoveredNode.cluster === key);
      const isSelectedCluster = selectedCandidateId && (nodes.find(n => n.id === selectedCandidateId)?.cluster === key);
      const isClusterActive = isHoveredCluster || isSelectedCluster;
      ctx.fillStyle = isClusterActive
        ? (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 17, 23, 0.12)')
        : (isDark ? 'rgba(255, 255, 255, 0.025)' : 'rgba(15, 17, 23, 0.035)');
      ctx.font = '900 18px Inter, sans-serif';
      ctx.fillText(meta.label.toUpperCase(), cx, cy);
      ctx.restore();
    });

    // 3. Draw Edges (Subtle connection lines, highlight on hover/explain)
    edges.forEach((e) => {
      const sourceNode = e.source;
      const targetNode = e.target;
      if (typeof sourceNode !== 'object' || typeof targetNode !== 'object') return;

      const sourceCoords = driftMap.get(sourceNode.id) || sourceNode;
      const targetCoords = driftMap.get(targetNode.id) || targetNode;

      const sId = sourceNode.id;
      const tId = targetNode.id;

      const isHoveredPath = hoveredNode && (hoveredNode.id === sId || hoveredNode.id === tId);
      const isEdgeHovered = hoveredEdge && (
        (hoveredEdge.source && typeof hoveredEdge.source === 'object' ? hoveredEdge.source.id : hoveredEdge.source) === sId &&
        (hoveredEdge.target && typeof hoveredEdge.target === 'object' ? hoveredEdge.target.id : hoveredEdge.target) === tId
      );

      // Determine default base opacity vs interactive highlight opacity
      let edgeOpacity = 0.12;
      let isEdgeHighlighted = false;
      let edgeProgress = 0;

      if (hoveredNode && hoveredNode.type === 'candidate') {
        if (isHoveredPath) {
          const partnerNode = sId === hoveredNode.id ? targetNode : sourceNode;
          const delay = NODE_RIPPLE_DELAY[partnerNode.type] || 0;
          const elapsed = Date.now() - hoverStartTimeRef.current;
          if (elapsed >= delay) {
            isEdgeHighlighted = true;
            edgeProgress = Math.min(1.0, (elapsed - delay) / 80);
            edgeOpacity = 0.12 + 0.73 * edgeProgress; // goes from 0.12 to 0.85
          } else {
            edgeOpacity = 0.02;
          }
        } else {
          edgeOpacity = 0.02;
        }
      } else if (hoveredNode) {
        // Hovering a non-candidate node
        edgeOpacity = isHoveredPath ? 0.85 : 0.02;
        isEdgeHighlighted = isHoveredPath;
        edgeProgress = isHoveredPath ? 1.0 : 0;
      } else if (hoveredEdge) {
        edgeOpacity = isEdgeHovered ? 0.95 : 0.04;
        isEdgeHighlighted = isEdgeHovered;
        edgeProgress = isEdgeHovered ? 1.0 : 0;
      }

      // Check search active fade (disconnected edges fade to 20%)
      const needle = q.trim().toLowerCase();
      if (needle && !hoveredNode && !hoveredEdge) {
        const sourceMatches = sourceNode.type === 'skill' && sourceNode.label.toLowerCase().includes(needle);
        const targetMatches = targetNode.type === 'skill' && targetNode.label.toLowerCase().includes(needle);
        const sourceCandMatches = sourceNode.type === 'candidate' && (sourceNode.skills || []).some(s => s.toLowerCase().includes(needle));
        const targetCandMatches = targetNode.type === 'candidate' && (targetNode.skills || []).some(s => s.toLowerCase().includes(needle));
        
        const isPartofSearch = sourceMatches || targetMatches || sourceCandMatches || targetCandMatches;
        edgeOpacity = isPartofSearch ? 0.45 : 0.02;
      }

      // Edge Color selection
      if (explainMode) {
        if (e.type === 'skill') ctx.strokeStyle = `rgba(34, 197, 94, ${edgeOpacity})`; // Green
        else if (e.type === 'similarity') ctx.strokeStyle = `rgba(59, 130, 246, ${edgeOpacity})`; // Blue
        else if (e.type === 'company') ctx.strokeStyle = `rgba(249, 115, 22, ${edgeOpacity})`; // Orange
        else if (e.type === 'certification') ctx.strokeStyle = `rgba(168, 85, 247, ${edgeOpacity})`; // Purple
        else if (e.type === 'risk') ctx.strokeStyle = `rgba(239, 68, 68, ${edgeOpacity})`; // Red
        else ctx.strokeStyle = `rgba(148, 163, 184, ${edgeOpacity})`;
      } else {
        ctx.strokeStyle = isEdgeHighlighted ? `rgba(99, 102, 241, ${edgeOpacity})` : `rgba(148, 163, 184, ${edgeOpacity})`;
      }

      ctx.lineWidth = isEdgeHighlighted ? 1.8 : 0.9;

      // Animate marching dash lines for active hovered connections
      ctx.save();
      if (isEdgeHighlighted) {
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -(Date.now() / 60) % 24;
      } else {
        ctx.setLineDash(e.type === 'skill' || e.type === 'certification' ? [1.5, 3.5] : []);
      }

      ctx.beginPath();
      ctx.moveTo(sourceCoords.x, sourceCoords.y);
      ctx.lineTo(targetCoords.x, targetCoords.y);
      ctx.stroke();
      ctx.restore();

      // Render tooltip label for hovered edge or hovered node connections
      if (isEdgeHighlighted && (edgeProgress >= 0.8 || hoveredEdge)) {
        const labelText = getEdgeLabelText(e);
        drawEdgeLabel(ctx, sourceCoords.x, sourceCoords.y, targetCoords.x, targetCoords.y, labelText);
      }
    });

    // 4. Draw Nodes (Candidate circle avatar, Skill Hexagon, Company Square, Cert Diamond, Risk Triangle)
    nodes.forEach((n) => {
      const isHovered = hoveredNode?.id === n.id;
      const isSelected = selectedCandidateId === n.id;
      const isConnected = hoveredNode && edges.some(e => {
        const sId = e.source && typeof e.source === 'object' ? e.source.id : e.source;
        const tId = e.target && typeof e.target === 'object' ? e.target.id : e.target;
        return (sId === hoveredNode.id && tId === n.id) || (tId === hoveredNode.id && sId === n.id);
      });

      // Node opacity logic based on Hover & Search
      let opacity = 1.0;
      let highlightProgress = 0;
      let isHighlighted = false;
      const needle = q.trim().toLowerCase();

      if (hoveredNode && hoveredNode.type === 'candidate') {
        const elapsed = Date.now() - hoverStartTimeRef.current;
        if (isHovered) {
          isHighlighted = true;
          highlightProgress = 1.0;
          opacity = 1.0;
        } else if (isConnected) {
          const delay = NODE_RIPPLE_DELAY[n.type] || 0;
          if (elapsed >= delay) {
            isHighlighted = true;
            highlightProgress = Math.min(1.0, (elapsed - delay) / 80);
            opacity = 0.2 + 0.8 * highlightProgress;
          } else {
            opacity = 0.2; // Not reached by ripple yet (faded to 20%)
          }
        } else {
          opacity = 0.2; // Disconnected nodes fade to 20%
        }
      } else if (hoveredNode) {
        // Hovering non-candidate node: standard isolation
        opacity = isHovered || isConnected ? 1.0 : 0.2;
        isHighlighted = isHovered;
        highlightProgress = isHovered ? 1.0 : 0;
      } else if (hoveredEdge) {
        const sId = hoveredEdge.source && typeof hoveredEdge.source === 'object' ? hoveredEdge.source.id : hoveredEdge.source;
        const tId = hoveredEdge.target && typeof hoveredEdge.target === 'object' ? hoveredEdge.target.id : hoveredEdge.target;
        opacity = (sId === n.id || tId === n.id) ? 1.0 : 0.2;
      } else if (needle) {
        const isNodeMatch = (n.label || '').toLowerCase().includes(needle) || 
                            (n.title || '').toLowerCase().includes(needle);
        const isCandidateMatch = n.type === 'candidate' && (n.skills || []).some(s => s.toLowerCase().includes(needle));
        const isSkillMatch = n.type === 'skill' && n.label.toLowerCase().includes(needle);
        
        const isConnectedToMatch = edges.some(e => {
          const sId = e.source && typeof e.source === 'object' ? e.source.id : e.source;
          const tId = e.target && typeof e.target === 'object' ? e.target.id : e.target;
          const partnerId = sId === n.id ? tId : (tId === n.id ? sId : null);
          if (!partnerId) return false;
          const partner = nodes.find(nd => nd.id === partnerId);
          if (!partner) return false;
          return (partner.label || '').toLowerCase().includes(needle) || 
                 (partner.title || '').toLowerCase().includes(needle) ||
                 (partner.skills && partner.skills.some(s => s.toLowerCase().includes(needle)));
        });

        const isPartofSearch = isNodeMatch || isCandidateMatch || isSkillMatch || isConnectedToMatch;
        opacity = isPartofSearch ? 1.0 : 0.2;
      }

      const coords = driftMap.get(n.id) || n;
      const cx = coords.x;
      const cy = coords.y;

      // Connected nodes increase slightly in size
      const sizeBonus = isHovered ? 2.5 : (isSelected ? 3.5 : (isConnected && isHighlighted ? 2.5 * highlightProgress : 0));
      const r = n.radius + sizeBonus;

      // 1. Candidate (Circular avatar silhouette)
      if (n.type === 'candidate') {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(99, 102, 241, ${opacity})`; // Indigo
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#818cf8' : isHovered ? '#a5b4fc' : `rgba(129, 140, 248, ${opacity * 0.4})`;
        ctx.lineWidth = isSelected ? 3.0 : isHovered ? 2.0 : 1.2;
        ctx.stroke();

        // Silhouette drawing inside clipped candidate circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
        ctx.clip();

        ctx.fillStyle = isDark ? `rgba(255, 255, 255, ${opacity * 0.75})` : `rgba(255, 255, 255, ${opacity * 0.85})`;

        // Torso
        ctx.beginPath();
        ctx.arc(cx, cy + r * 1.1, r * 0.8, Math.PI, 0, false);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(cx, cy - r * 0.15, r * 0.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
      // 2. Skill (Sky Blue Hexagon)
      else if (n.type === 'skill') {
        ctx.beginPath();
        const hexRad = r;
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i + Math.PI / 6; // Rotated 30deg
          ctx.lineTo(cx + hexRad * Math.cos(angle), cy + hexRad * Math.sin(angle));
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(56, 189, 248, ${opacity})`; // Sky Blue
        ctx.fill();
        ctx.strokeStyle = isHovered ? '#e0f2fe' : `rgba(56, 189, 248, ${opacity * 0.5})`;
        ctx.lineWidth = isHovered ? 2.0 : 1.2;
        ctx.stroke();
      }
      // 3. Company (Cool Grey Square with centered initials)
      else if (n.type === 'company') {
        const sqSz = r * 2;
        ctx.fillStyle = `rgba(156, 163, 175, ${opacity})`; // Cool Grey
        ctx.fillRect(cx - sqSz / 2, cy - sqSz / 2, sqSz, sqSz);
        ctx.strokeStyle = isHovered ? '#f3f4f6' : `rgba(156, 163, 175, ${opacity * 0.5})`;
        ctx.lineWidth = isHovered ? 2.0 : 1.2;
        ctx.strokeRect(cx - sqSz / 2, cy - sqSz / 2, sqSz, sqSz);

        const initials = n.label ? n.label.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() : '';
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.95})`;
        ctx.font = 'bold 8px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials, cx, cy);
        ctx.restore();
      }
      // 4. Certification (Purple Diamond)
      else if (n.type === 'certification') {
        const dRad = r;
        ctx.beginPath();
        ctx.moveTo(cx, cy - dRad);
        ctx.lineTo(cx + dRad, cy);
        ctx.lineTo(cx, cy + dRad);
        ctx.lineTo(cx - dRad, cy);
        ctx.closePath();
        ctx.fillStyle = `rgba(168, 85, 247, ${opacity})`; // Purple
        ctx.fill();
        ctx.strokeStyle = isHovered ? '#f3e8ff' : `rgba(168, 85, 247, ${opacity * 0.5})`;
        ctx.lineWidth = isHovered ? 2.0 : 1.2;
        ctx.stroke();
      }
      // 5. Risk (Red Warning Triangle with centered exclamation mark !)
      else if (n.type === 'risk') {
        const tRad = r;
        ctx.beginPath();
        ctx.moveTo(cx, cy - tRad);
        ctx.lineTo(cx + tRad, cy + tRad);
        ctx.lineTo(cx - tRad, cy + tRad);
        ctx.closePath();
        ctx.fillStyle = `rgba(239, 68, 68, ${opacity})`; // Red
        ctx.fill();
        ctx.strokeStyle = isHovered ? '#fee2e2' : `rgba(239, 68, 68, ${opacity * 0.5})`;
        ctx.lineWidth = isHovered ? 2.0 : 1.2;
        ctx.stroke();

        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.font = 'bold 8px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', cx, cy + tRad * 0.3);
        ctx.restore();
      }

      // Display text labels on Hover, Connection, or high Zoom levels (using interpolated scale)
      const currentScale = renderTransformRef.current.scale;
      const showLabel = isHovered || (isConnected && isHighlighted && highlightProgress >= 0.8) || currentScale >= 1.65;
      if (showLabel) {
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        if (n.type === 'candidate') {
          ctx.fillStyle = isDark ? `rgba(255, 255, 255, ${opacity})` : `rgba(15, 17, 23, ${opacity})`;
          ctx.font = 'bold 11px Inter, sans-serif';
          ctx.fillText(`Candidate ${n.label}`, cx + r + 8, cy - 8);

          ctx.fillStyle = isDark ? `rgba(161, 161, 170, ${opacity})` : `rgba(113, 113, 122, ${opacity})`;
          ctx.font = '10px Inter, sans-serif';
          ctx.fillText(n.title || 'Specialist', cx + r + 8, cy + 6);
        } else {
          ctx.fillStyle = isDark ? `rgba(228, 228, 232, ${opacity})` : `rgba(26, 29, 38, ${opacity})`;
          ctx.font = '10px Inter, sans-serif';
          ctx.fillText(n.label, cx + r + 6, cy);
        }
        ctx.restore();
      }
    });

    ctx.restore();
  };

  // Keep drawing loop active at 60fps for smooth organic drift & breathing effects
  useEffect(() => {
    let animId;
    const tickAnim = () => {
      // Interpolate camera position towards target
      let targetX = transform.x;
      let targetY = transform.y;
      let targetScale = transform.scale;

      if (hoveredNode && hoveredNode.type === 'candidate') {
        // cinematic camera zoom (1.05x) and tiny pan towards candidate
        targetScale = transform.scale * 1.05;
        const currentScreenX = transform.x + hoveredNode.x * transform.scale;
        const currentScreenY = transform.y + hoveredNode.y * transform.scale;
        const dx = (dimensions.width / 2 - currentScreenX);
        const dy = (dimensions.height / 2 - currentScreenY);
        targetX = transform.x + Math.max(-8, Math.min(8, dx * 0.04));
        targetY = transform.y + Math.max(-6, Math.min(6, dy * 0.04));
      }

      const current = renderTransformRef.current;
      current.x += (targetX - current.x) * 0.1;
      current.y += (targetY - current.y) * 0.1;
      current.scale += (targetScale - current.scale) * 0.1;

      drawCanvas();
      animId = requestAnimationFrame(tickAnim);
    };
    animId = requestAnimationFrame(tickAnim);
    return () => cancelAnimationFrame(animId);
  }, [transform, dimensions, explainMode, isDark, hoveredNode, hoveredEdge, selectedCandidateId, q]);

  // Drag and Interactive Event Handlers
  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const currentT = renderTransformRef.current;
    const mouseX = (e.clientX - rect.left - currentT.x) / currentT.scale;
    const mouseY = (e.clientY - rect.top - currentT.y) / currentT.scale;

    if (activeDragNode.current) {
      activeDragNode.current.fx = mouseX;
      activeDragNode.current.fy = mouseY;
      simulationRef.current.alphaTarget(0.2).restart();

      // If we are dragging a candidate, check for proximity overlap with other candidates
      if (activeDragNode.current.type === 'candidate') {
        let closeCandidate = null;
        const otherCandidates = rawNodesRef.current.filter(
          n => n.type === 'candidate' && n.id !== activeDragNode.current.id
        );
        for (const c of otherCandidates) {
          const dx = activeDragNode.current.x - c.x;
          const dy = activeDragNode.current.y - c.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 50) {
            closeCandidate = c;
            break;
          }
        }

        if (closeCandidate?.id !== compareNodes?.node2?.id) {
          if (closeCandidate) {
            setCompareNodes({
              node1: activeDragNode.current,
              node2: closeCandidate
            });
          } else {
            setCompareNodes(null);
          }
        }
      } else if (compareNodes) {
        setCompareNodes(null);
      }
      return;
    }

    if (hoverClearTimeoutRef.current) {
      clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }

    if (isDraggingCanvas.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      dragStart.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Node check
    let foundNode = null;
    const nodes = rawNodesRef.current;
    for (const n of nodes) {
      const dx = n.x - mouseX;
      const dy = n.y - mouseY;
      if (Math.sqrt(dx * dx + dy * dy) < n.radius + 6) {
        foundNode = n;
        break;
      }
    }

    const foundNodeId = foundNode?.id || null;
    if (foundNodeId !== prevHoveredNodeIdRef.current) {
      prevHoveredNodeIdRef.current = foundNodeId;
      hoverStartTimeRef.current = foundNode ? Date.now() : 0;
    }

    if (foundNode) {
      setHoveredNode(foundNode);
    } else if (hoveredNode) {
      hoverClearTimeoutRef.current = setTimeout(() => {
        setHoveredNode(null);
        prevHoveredNodeIdRef.current = null;
      }, 110);
    }

    // Edge check if no node is hovered
    if (foundNode) {
      setHoveredEdge(null);
    } else {
      let foundEdge = null;
      const edges = rawEdgesRef.current;
      for (const e of edges) {
        const sourceNode = e.source;
        const targetNode = e.target;
        if (typeof sourceNode === 'object' && typeof targetNode === 'object') {
          const dist = getPointToSegmentDistance(mouseX, mouseY, sourceNode.x, sourceNode.y, targetNode.x, targetNode.y);
          if (dist < 4.5) {
            foundEdge = e;
            break;
          }
        }
      }
      setHoveredEdge(foundEdge);
    }
  };

  const handleMouseDown = (e) => {
    if (hoveredNode) {
      activeDragNode.current = hoveredNode;
      hoveredNode.fx = hoveredNode.x;
      hoveredNode.fy = hoveredNode.y;
    } else {
      isDraggingCanvas.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => {
    isDraggingCanvas.current = false;
    setCompareNodes(null);
    if (activeDragNode.current) {
      activeDragNode.current.fx = null;
      activeDragNode.current.fy = null;
      activeDragNode.current = null;
      simulationRef.current.alphaTarget(0);
    }
  };

  const handleMouseLeave = () => {
    handleMouseUp();
    if (hoverClearTimeoutRef.current) clearTimeout(hoverClearTimeoutRef.current);
    hoverClearTimeoutRef.current = setTimeout(() => {
      setHoveredNode(null);
      setHoveredEdge(null);
      prevHoveredNodeIdRef.current = null;
    }, 120);
  };

  const handleCanvasClick = () => {
    if (hoveredNode && hoveredNode.type === 'candidate' && !isDraggingCanvas.current) {
      onSelect?.(hoveredNode.id);
      setSelectedCandidateId(hoveredNode.id);

      // Slide and focus the candidate node towards left-center
      setTransform({
        x: dimensions.width / 2.8 - hoveredNode.x * 1.3,
        y: dimensions.height / 2 - hoveredNode.y * 1.3,
        scale: 1.3,
      });
    } else if (!hoveredNode || (hoveredNode && hoveredNode.type !== 'candidate')) {
      setSelectedCandidateId(null);
      onSelect?.(null);
      setTransform({ x: 0, y: 0, scale: 1.0 });
    }
  };

  const handleResetLayout = () => {
    setSelectedCandidateId(null);
    onSelect?.(null);
    setTransform({ x: 0, y: 0, scale: 1.0 });
    if (simulationRef.current) {
      simulationRef.current.alpha(0.3).restart();
    }
  };

  // Compute reactive node counts for diagnostics panel
  const candidateCount = graphData.nodes.filter(n => n.type === 'candidate').length;
  const skillCount = graphData.nodes.filter(n => n.type === 'skill').length;
  const companyCount = graphData.nodes.filter(n => n.type === 'company').length;
  const edgeCount = graphData.edges.length;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-background border border-border/80 rounded-md overflow-hidden select-none"
      style={{
        backgroundImage: 'radial-gradient(rgba(128, 128, 128, 0.12) 1.5px, transparent 1.5px)',
        backgroundSize: '24px 24px',
      }}
    >
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleCanvasClick}
        className="block w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Floating Toolbar Controls */}
      <div className="absolute top-4 left-4 flex flex-wrap items-center gap-2 bg-surface/95 backdrop-blur-md border border-border/80 p-2 rounded-md shadow-lg pointer-events-auto z-10 font-mono">
        {/* Search */}
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Talent Map..."
            className="w-40 pl-8 pr-2.5 py-1 text-xs bg-background/50 border border-border/60 rounded focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder-muted/60"
          />
        </div>

        <div className="w-px h-5 bg-border/80" />

        {/* Explainability Mode */}
        <button
          onClick={() => setExplainMode(!explainMode)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold border transition-colors cursor-pointer ${explainMode
              ? 'bg-primary text-white border-primary'
              : 'border-border bg-background/50 text-muted hover:text-foreground hover:bg-background/80'
            }`}
        >
          {explainMode ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted" />}
          <span>Explainability Mode</span>
        </button>

        {/* Layer Toggle */}
        <div className="relative group">
          <button className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold border border-border bg-background/50 text-muted hover:text-foreground hover:bg-background/80 cursor-pointer">
            <Layers className="h-3.5 w-3.5" />
            <span>Layer Toggle</span>
          </button>
          <div className="absolute left-0 top-7 hidden group-hover:block w-40 bg-surface border border-border rounded p-2 shadow-lg space-y-1.5 z-20">
            {Object.keys(activeLayers).map((layer) => (
              <label key={layer} className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:text-primary transition-colors">
                <input
                  type="checkbox"
                  checked={activeLayers[layer]}
                  onChange={() => toggleLayer(layer)}
                  className="rounded text-primary focus:ring-0 cursor-pointer"
                />
                <span className="capitalize">{layer}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-background/50 border border-border/60 rounded p-0.5">
          <button
            onClick={() => setTransform((prev) => ({ ...prev, scale: Math.min(3.0, prev.scale + 0.15) }))}
            className="p-1 rounded text-muted hover:text-foreground hover:bg-surface-hover/80 cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setTransform((prev) => ({ ...prev, scale: Math.max(0.5, prev.scale - 0.15) }))}
            className="p-1 rounded text-muted hover:text-foreground hover:bg-surface-hover/80 cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Center View */}
        <button
          onClick={handleResetLayout}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold border border-border bg-background/50 text-muted hover:text-foreground hover:bg-background/80 cursor-pointer"
          title="Center View"
        >
          <Crosshair className="h-3.5 w-3.5" />
          <span>Center View</span>
        </button>
      </div>

      {/* Floating System Diagnostics Console (top right) */}
      <div className="absolute top-4 right-4 bg-surface/95 backdrop-blur-md border border-border/80 p-3.5 rounded-md max-w-[260px] pointer-events-auto shadow-lg z-10 font-mono text-[10px] space-y-1.5">
        <div className="flex items-center gap-1.5 text-primary font-bold uppercase border-b border-border/40 pb-1 mb-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Diagnostics Console</span>
        </div>
        <div className="space-y-1 text-muted">
          <div className="flex justify-between gap-4">
            <span>CANDIDATES:</span>
            <span className="text-foreground font-bold">{candidateCount}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>SKILLS:</span>
            <span className="text-foreground font-bold">{skillCount}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>COMPANIES:</span>
            <span className="text-foreground font-bold">{companyCount}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>EDGES:</span>
            <span className="text-foreground font-bold">{edgeCount}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>SELECTION:</span>
            <span className="text-foreground font-bold">{selectedCandidateId || 'NONE'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>EXPLAIN MODE:</span>
            <span className="text-foreground font-bold">{explainMode ? 'ACTIVE' : 'INACTIVE'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>PHYSICS:</span>
            <span className="text-accent uppercase font-bold">
              {simulationRef.current && simulationRef.current.alpha() > 0.02 ? 'ACTIVE' : 'STABLE'}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span>SEARCH ACTIVE:</span>
            <span className="text-foreground font-bold">{q.trim() !== '' ? 'YES' : 'NO'}</span>
          </div>
        </div>
      </div>

      {/* Legend HUD (Bottom Left) - positioned permanently */}
      <div className="absolute bottom-4 left-4 p-3 bg-surface/95 backdrop-blur-md border border-border/85 rounded shadow-lg pointer-events-none z-10 font-mono text-[10px] text-foreground space-y-1.5 w-44">
        <div className="text-primary font-bold uppercase border-b border-border/40 pb-0.5 mb-1.5">Entity Key</div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-primary/40 border border-primary/60 inline-block shrink-0" />
          <span className="text-muted text-[9px] uppercase">Candidate</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rotate-45 border border-[#adc6ff] bg-sky-500/30 inline-block shrink-0" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }} />
          <span className="text-muted text-[9px] uppercase">Skill</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 border border-foreground bg-zinc-500/30 inline-block shrink-0" />
          <span className="text-muted text-[9px] uppercase">Company</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rotate-45 border border-[#ffdcc5] bg-amber-500/30 inline-block shrink-0" />
          <span className="text-muted text-[9px] uppercase">Certification</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 border border-red-500 bg-red-500/30 inline-block shrink-0" style={{ clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }} />
          <span className="text-muted text-[9px] uppercase">Risk</span>
        </div>
      </div>

      {/* Floating Candidate Intelligence Preview Panel */}
      <AnimatePresence>
        {hoveredNode && hoveredNode.type === 'candidate' && previewData && !comparisonData && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 3 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 3 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bg-surface/95 backdrop-blur-md border border-border/85 p-3.5 rounded-md shadow-2xl z-30 font-mono text-[10px] space-y-3 pointer-events-none"
            style={{
              left: panelPos.left,
              top: panelPos.top,
              width: '340px',
            }}
          >
            {/* Top Row: Avatar, Name, Role, Match Score */}
            <div className="flex items-center justify-between border-b border-border/45 pb-2.5 gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-10 w-10 bg-primary/10 border border-primary/25 rounded-full flex items-center justify-center shrink-0 overflow-hidden relative">
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/8">
                    <User className="h-5 w-5 text-primary/90" />
                  </div>
                </div>
                <div className="min-w-0">
                  <h4 className="text-foreground font-bold text-[11px] truncate font-mono">{previewData.name}</h4>
                  <p className="text-muted text-[9px] truncate font-sans font-medium">{previewData.role}</p>
                </div>
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded border shrink-0 ${
                previewData.scorePct >= 80 ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-warning/10 border-warning/30 text-warning'
              }`}>
                {previewData.scorePct}% Match
              </span>
            </div>

            {/* Second Row: Company, YOE, Location, Availability */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[9px] text-muted border-b border-border/40 pb-2.5">
              <div className="truncate"><strong className="text-foreground uppercase tracking-wider">Company:</strong> {previewData.company}</div>
              <div className="truncate"><strong className="text-foreground uppercase tracking-wider">Experience:</strong> {previewData.experience}</div>
              <div className="truncate"><strong className="text-foreground uppercase tracking-wider">Location:</strong> {previewData.location}</div>
              <div className="truncate">
                <strong className="text-foreground uppercase tracking-wider">Availability:</strong>{' '}
                <span className="text-accent font-semibold">{previewData.availability}</span>
              </div>
            </div>

            {/* Third Row: Top Skills badge chips */}
            <div className="space-y-1">
              <span className="text-muted block text-[8px] uppercase tracking-wider">Top Skills</span>
              <div className="flex flex-wrap gap-1.5">
                {previewData.topSkills.map(skill => (
                  <span key={skill} className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-[8px] text-primary uppercase font-bold">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            {/* Fourth Row: Semantic Explanation text */}
            <div className="bg-background/60 border border-border/60 p-2.5 rounded text-[10px] text-muted leading-relaxed font-sans">
              <span className="text-primary font-bold block font-mono text-[8px] mb-1.5 uppercase tracking-wider">Semantic Explanation</span>
              "{previewData.semanticText}"
            </div>

            {/* Fifth Row: Confidence Progress Bars */}
            <div className="space-y-1.5 pt-1.5 border-t border-border/20">
              <span className="text-muted block text-[8px] uppercase tracking-wider">Confidence</span>
              {previewData.confidence.map(m => (
                <div key={m.label} className="flex items-center justify-between gap-3 text-[9px]">
                  <span className="text-muted w-20 truncate">{m.label}:</span>
                  <div className="flex-1 h-1 bg-background border border-border/40 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${m.val}%` }}
                      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full bg-accent rounded-full"
                    />
                  </div>
                  <span className="font-bold text-foreground w-8 text-right font-mono">{m.val}%</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected Node Mini HUD Indicator - Stacks beautifully above Legend */}
      {hoveredNode && hoveredNode.type !== 'candidate' && !comparisonData && (
        <div className="absolute bottom-[160px] left-4 p-3 bg-surface border border-border/80 rounded shadow-md pointer-events-none z-10 font-mono text-[10px] text-foreground flex items-center gap-2">
          {hoveredNode.type === 'skill' && <Wrench className="h-3.5 w-3.5 text-info" />}
          {hoveredNode.type === 'company' && <Building className="h-3.5 w-3.5 text-muted" />}
          {hoveredNode.type === 'certification' && <Award className="h-3.5 w-3.5 text-support" />}
          {hoveredNode.type === 'risk' && <Award className="h-3.5 w-3.5 text-error" />}
          <span className="uppercase text-muted">{hoveredNode.type}:</span>
          <span className="font-bold">{hoveredNode.label}</span>
        </div>
      )}

      {/* Empty Minimap Placeholder (bottom right) */}
      <div className="absolute bottom-4 right-4 w-36 h-28 bg-surface/95 backdrop-blur-md border border-border/80 rounded p-2.5 shadow-lg pointer-events-none z-10 font-mono text-[9px] flex flex-col justify-between">
        <div className="flex items-center justify-between border-b border-border/40 pb-1">
          <span className="text-muted uppercase font-bold text-[8px] tracking-wider">Radar Minimap</span>
          <span className="text-muted/40 text-[7px] uppercase tracking-widest font-semibold animate-pulse">STANDBY</span>
        </div>
        <div className="flex-1 flex items-center justify-center relative">
          {/* Subtle concentric circles */}
          <div className="absolute w-16 h-16 border border-dashed border-border/20 rounded-full flex items-center justify-center">
            <div className="w-10 h-10 border border-dotted border-primary/20 rounded-full flex items-center justify-center font-mono">
              <div className="w-4 h-4 border border-border/10 rounded-full" />
            </div>
          </div>
          {/* Rotating radar line */}
          <div 
            className="absolute w-16 h-[1px] bg-gradient-to-r from-transparent to-primary/45 origin-center animate-[spin_4s_linear_infinite]"
            style={{ transformOrigin: 'center center' }}
          />
        </div>
        <div className="text-[7px] text-muted/50 uppercase text-center border-t border-border/30 pt-1">
          Grid: 16x16 Sync
        </div>
      </div>

      {/* Drag Overlap Candidate Comparison Card Overlay */}
      {comparisonData && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-30 p-6">
          <div className="w-full max-w-lg border border-primary/20 bg-surface p-6 rounded shadow-2xl font-mono text-xs text-foreground animate-scale-up">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent animate-pulse" />
                <span className="font-bold text-label uppercase">AI Co-Matching Engine</span>
              </div>
              <span className="text-[10px] text-muted">DRAG OVERLAY COMPARISON</span>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* Candidate 1 */}
              <div className="border-r border-border/60 pr-4">
                <div className="font-bold text-primary mb-1">CANDIDATE {comparisonData.c1.candidate_id.split('-').pop()}</div>
                <div className="text-[11px] text-foreground font-sans font-semibold truncate">{comparisonData.c1.title}</div>
                <div className="text-muted text-[10px] mt-0.5">{comparisonData.c1.location} // {comparisonData.c1.yoe} YOE</div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-muted text-[10px]">SCORE:</span>
                  <span className="text-accent font-bold font-mono text-[14px]">{(comparisonData.c1.score * 100).toFixed(0)}%</span>
                </div>
              </div>
              {/* Candidate 2 */}
              <div className="pl-2">
                <div className="font-bold text-primary mb-1">CANDIDATE {comparisonData.c2.candidate_id.split('-').pop()}</div>
                <div className="text-[11px] text-foreground font-sans font-semibold truncate">{comparisonData.c2.title}</div>
                <div className="text-muted text-[10px] mt-0.5">{comparisonData.c2.location} // {comparisonData.c2.yoe} YOE</div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-muted text-[10px]">SCORE:</span>
                  <span className="text-accent font-bold font-mono text-[14px]">{(comparisonData.c2.score * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-3 border-t border-border/40">
              {/* Shared Skills */}
              <div>
                <span className="text-muted block text-[10px] mb-1.5 uppercase">Shared Skills Stack:</span>
                <div className="flex flex-wrap gap-1.5">
                  {comparisonData.sharedSkills.length > 0 ? (
                    comparisonData.sharedSkills.map(s => (
                      <span key={s} className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-[9px] text-primary uppercase font-bold">
                        {s}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted italic text-[10px]">None identified in core profile</span>
                  )}
                </div>
              </div>

              {/* Shared Companies */}
              <div>
                <span className="text-muted block text-[10px] mb-1.5 uppercase">Shared Experience:</span>
                <div className="flex flex-wrap gap-1.5">
                  {comparisonData.sharedCompanies.length > 0 ? (
                    comparisonData.sharedCompanies.map(c => (
                      <span key={c} className="px-2 py-0.5 rounded bg-zinc-500/10 border border-zinc-500/20 text-[9px] text-muted uppercase font-bold">
                        {c} Network
                      </span>
                    ))
                  ) : (
                    <span className="text-muted italic text-[10px]">No overlapping corporate history</span>
                  )}
                </div>
              </div>

              {/* AI Fit Gap Analysis */}
              <div className="bg-background/50 border border-border/60 p-3 rounded text-[10px] text-muted leading-relaxed">
                <span className="text-primary font-bold block mb-1">GAP MATCH ANALYSIS //</span>
                The candidates differ by <span className="text-accent font-bold">{comparisonData.scoreDiff.toFixed(0)}%</span> composite semantic fit.
                {comparisonData.sharedSkills.length > 0 ? ' Both share proficiency in core stacks ' + comparisonData.sharedSkills.join(', ') + '.' : ' They have zero overlap in target core skills.'}
                Recommend Candidate {comparisonData.c1.score >= comparisonData.c2.score ? comparisonData.c1.candidate_id.split('-').pop() : comparisonData.c2.candidate_id.split('-').pop()} for leadership stack.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(TalentIntelligenceMap);
