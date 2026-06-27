import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Radar, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Cpu, 
  Terminal, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef(null);

  // States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Canvas Grid background animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const drawGrid = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#050608';
      ctx.fillRect(0, 0, width, height);

      // Faint coordinate lattice points
      ctx.fillStyle = 'rgba(99, 102, 241, 0.04)';
      const step = 80;
      const time = Date.now() * 0.0003;
      const offsetX = Math.sin(time) * 15;
      const offsetY = Math.cos(time * 0.8) * 15;

      for (let x = offsetX - step; x < width + step; x += step) {
        for (let y = offsetY - step; y < height + step; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Drawing a subtle network grid overlay in the background
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.025)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = offsetX - step; x < width + step; x += step * 3) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = offsetY - step; y < height + step; y += step * 3) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      animId = requestAnimationFrame(drawGrid);
    };

    drawGrid();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!email.trim()) {
      setError('Operator email address required.');
      return;
    }
    if (!password.trim()) {
      setError('Security clearance passphrase required.');
      return;
    }

    setLoading(true);
    // Simulate minor loading delays (palantir style decrypting look)
    setTimeout(() => {
      const success = login(email, password);
      if (success) {
        navigate('/', { replace: true });
      } else {
        setError('Clearance authentication failed.');
        setLoading(false);
      }
    }, 1200);
  };

  return (
    <div className="relative min-h-screen w-screen flex items-center justify-center overflow-hidden bg-[#050608]">
      {/* Background Interactive Lattice */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />

      {/* Login HUD Frame Wrapper */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-[430px] mx-4 border border-indigo-950/40 bg-zinc-950/70 backdrop-blur-md rounded p-8 shadow-2xl z-10 font-mono text-xs text-zinc-300"
      >
        {/* Radar Brand Mark */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 mb-3 shadow-indigo-500/5 shadow-inner">
            <Radar className="h-6 w-6 animate-pulse" />
          </div>
          <h1 className="text-[15px] font-bold tracking-tight text-white uppercase">
            Redrob Operating System
          </h1>
          <p className="text-[10px] text-zinc-500 uppercase mt-1">
            Authentication Gate // Security Clearance
          </p>
        </div>

        {/* Validation Errors */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 border border-red-500/35 bg-red-950/20 px-3.5 py-2.5 rounded text-[10px] text-red-400 flex items-start gap-2"
          >
            <span className="font-bold shrink-0">[!] ERROR:</span>
            <span>{error}</span>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email/Clearance ID */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 uppercase font-bold block">Operator Clearance ID</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 h-3.5 w-3.5 text-zinc-600" />
              <input
                type="email"
                placeholder="operator@redrob.ai"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full pl-9 pr-3.5 py-3 bg-zinc-950/90 border border-zinc-900 focus:border-indigo-500/50 rounded focus:outline-none text-[11px] text-white font-mono placeholder-zinc-700 transition-colors"
              />
            </div>
          </div>

          {/* Passphrase */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[10px] text-zinc-500 uppercase font-bold">Security Passphrase</label>
              <span className="text-[9px] text-indigo-500/60 hover:text-indigo-400 cursor-pointer">Recover Key</span>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 h-3.5 w-3.5 text-zinc-600" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full pl-9 pr-10 py-3 bg-zinc-950/90 border border-zinc-900 focus:border-indigo-500/50 rounded focus:outline-none text-[11px] text-white font-mono placeholder-zinc-700 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                className="absolute right-3 top-3.5 text-zinc-600 hover:text-zinc-400 focus:outline-none"
              >
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Remember me */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-[10px] text-zinc-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={() => setRememberMe(!rememberMe)}
                disabled={loading}
                className="rounded border-zinc-900 bg-zinc-950 checked:bg-indigo-600 focus:ring-0 cursor-pointer"
              />
              <span>Remember clearance credentials</span>
            </label>
          </div>

          {/* Execute Login action */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white text-[11px] font-bold uppercase tracking-wider rounded transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Cpu className="h-3.5 w-3.5 animate-spin" />
                <span>Decrypting Clearance Stack...</span>
              </>
            ) : (
              <>
                <span>Authenticate Gateway</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </>
            )}
          </button>
        </form>

        {/* Footer diagnostic logs */}
        <div className="mt-8 pt-6 border-t border-zinc-900/60 text-[9px] text-zinc-600 space-y-1 leading-relaxed">
          <div className="flex items-center gap-1.5">
            <Terminal className="h-3 w-3 text-indigo-500/40" />
            <span>SYS: GATEWAY CONNECTED // INFERENCE READY</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-indigo-500/40" />
            <span>GUIDE: Enter any email/password to login</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
