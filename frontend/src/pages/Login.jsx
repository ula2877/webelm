import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
// Imported (not a "/src/..." path) so Vite bundles the asset into the build output.
import logoElmech from '../assets/logo/logo_elmech.png';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, error } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Auth is keyed on the `username` column of tb_user (there is no email column),
    // so the field must stay type="text" - type="email" would block submission.
    const success = await login(username.trim(), password);
    if (success) {
      navigate('/dashboard', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 p-12 flex-col justify-between relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-3">
            <img
              src={logoElmech}
              alt="ELMECH Logo"
              className="w-10 h-10 object-contain"
            />
            <span className="text-2xl font-bold text-white">ELMECH</span>
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-primary-200 text-sm">
            &copy; 2026 ELMECH. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-[#F8FAFC]">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <img
              src={logoElmech}
              alt="ELMECH Logo"
              className="w-10 h-10 object-contain"
            />
            <span className="text-2xl font-bold text-text-primary">ELMECH</span>
          </div>

          <div className="mb-8">
            <h2 className="page-title">Sign in</h2>
            <p className="text-text-secondary">Enter your credentials to access your account</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 animate-fade-in">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Username"
              type="text"
              name="username"
              autoComplete="username"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              icon={User}
              required
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={Lock}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[38px] text-text-muted hover:text-text-primary transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={isLoading}
              icon={ArrowRight}
              iconPosition="right"
            >
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
