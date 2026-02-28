// Login Page - User authentication
// v1.0 - Initial implementation

'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-primary-700 rounded-2xl mx-auto flex items-center justify-center shadow-lg">
            <span className="text-white text-3xl font-bold">灵</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Lingtin 桌访系统</h1>
          <p className="mt-1 text-gray-500">请登录以继续</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-400 focus:border-primary-400 outline-none transition"
              placeholder="请输入用户名"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-400 focus:border-primary-400 outline-none transition"
              placeholder="请输入密码"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary-600 text-white py-3 rounded-xl font-medium hover:bg-primary-700 focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>

        {/* Test credentials hint */}
        <p className="mt-4 text-center text-xs text-gray-400">
          测试账号: test / test123
        </p>
      </div>
    </div>
  );
}
