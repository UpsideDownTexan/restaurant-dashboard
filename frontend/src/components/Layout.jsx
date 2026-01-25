import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  DollarSign,
  Users,
  PieChart,
  Store,
  Settings,
  Menu,
  X,
  ChevronDown,
  Bell
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Sales', href: '/sales', icon: DollarSign },
  { name: 'Labor', href: '/labor', icon: Users },
  { name: 'Locations', href: '/locations', icon: Store },
];

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <PieChart className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">PrimeView</span>
          </Link>
          <button
            className="lg:hidden text-slate-500 hover:text-slate-700"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                to={item.href}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Restaurant brands section */}
        <div className="px-4 mt-6">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 mb-2">
            Brands
          </h3>
          <div className="space-y-1">
            <Link
              to="/locations?brand=Marianos"
              className="sidebar-link text-sm"
              onClick={() => setSidebarOpen(false)}
            >
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Mariano's</span>
            </Link>
            <Link
              to="/locations?brand=La Hacienda Ranch"
              className="sidebar-link text-sm"
              onClick={() => setSidebarOpen(false)}
            >
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span>La Hacienda Ranch</span>
            </Link>
          </div>
        </div>

        {/* Settings link at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200">
          <Link
            to="/settings"
            className="sidebar-link"
            onClick={() => setSidebarOpen(false)}
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8">
          <button
            className="lg:hidden text-slate-600 hover:text-slate-900"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="flex-1 flex justify-end items-center gap-4">
            {/* Notifications */}
            <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>

            {/* User menu */}
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100">
              <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-brand-700">AG</span>
              </div>
              <span className="hidden md:block text-sm font-medium text-slate-700">
                Alexis
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
