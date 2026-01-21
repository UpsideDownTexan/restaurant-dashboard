import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Settings as SettingsIcon,
  Database,
  RefreshCw,
  Upload,
  Clock,
  CheckCircle,
  AlertCircle,
  Server
} from 'lucide-react';
import { api } from '../utils/api';

export default function Settings() {
  const [scrapeDate, setScrapeDate] = useState('');
  const [importStatus, setImportStatus] = useState(null);

  // Health check
  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['health'],
    queryFn: api.healthCheck,
    refetchInterval: 30000, // Check every 30 seconds
  });

  // Manual scrape trigger
  const scrapeMutation = useMutation({
    mutationFn: (date) => api.triggerScrape(date || null),
    onSuccess: () => {
      setImportStatus({ type: 'success', message: 'Scrape job started successfully' });
    },
    onError: (error) => {
      setImportStatus({ type: 'error', message: error.message });
    },
  });

  const handleTriggerScrape = () => {
    scrapeMutation.mutate(scrapeDate || null);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Configure data imports and system settings</p>
      </div>

      {/* System Status */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Server className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-900">System Status</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              {health?.status === 'healthy' ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500" />
              )}
              <span className="font-medium text-slate-700">API Server</span>
            </div>
            <p className="text-sm text-slate-500">
              {healthLoading ? 'Checking...' : health?.status === 'healthy' ? 'Online' : 'Offline'}
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-blue-500" />
              <span className="font-medium text-slate-700">Database</span>
            </div>
            <p className="text-sm text-slate-500">SQLite (Local)</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-purple-500" />
              <span className="font-medium text-slate-700">Uptime</span>
            </div>
            <p className="text-sm text-slate-500">
              {health?.uptime ? `${Math.floor(health.uptime / 60)} minutes` : '--'}
            </p>
          </div>
        </div>
      </div>

      {/* Manual Data Import */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <RefreshCw className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-900">Manual Data Sync</h3>
        </div>

        <p className="text-slate-600 mb-4">
          Trigger a manual data pull from Aloha Enterprise and NetChex. This will run the same
          process that runs automatically at 1:30 AM daily.
        </p>

        {importStatus && (
          <div className={`mb-4 p-3 rounded-lg ${
            importStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {importStatus.message}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Date (optional)
            </label>
            <input
              type="date"
              value={scrapeDate}
              onChange={(e) => setScrapeDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Leave empty for yesterday"
            />
            <p className="text-xs text-slate-500 mt-1">
              Leave empty to pull yesterday's data
            </p>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleTriggerScrape}
              disabled={scrapeMutation.isPending}
              className="btn btn-primary flex items-center gap-2"
            >
              {scrapeMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Sync Data
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Data Sources */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Database className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-900">Data Sources</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 font-bold text-sm">AE</span>
              </div>
              <div>
                <h4 className="font-medium text-slate-900">Aloha Enterprise Online</h4>
                <p className="text-sm text-slate-500">POS sales data</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              Configured
            </span>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-purple-600 font-bold text-sm">NC</span>
              </div>
              <div>
                <h4 className="font-medium text-slate-900">NetChex</h4>
                <p className="text-sm text-slate-500">Payroll & labor data</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              Configured
            </span>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center">
                <span className="text-slate-500 font-bold text-sm">EDI</span>
              </div>
              <div>
                <h4 className="font-medium text-slate-900">Vendor EDI</h4>
                <p className="text-sm text-slate-500">Invoice & inventory data</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-sm font-medium">
              Coming Soon
            </span>
          </div>
        </div>
      </div>

      {/* Schedule Info */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-900">Automated Schedule</h3>
        </div>

        <div className="p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="font-medium text-slate-700">Daily at 1:30 AM CST</span>
          </div>
          <p className="text-sm text-slate-500">
            Data is automatically pulled from Aloha and NetChex every night at 1:30 AM to capture
            the previous day's complete data. Prime cost calculations are updated automatically
            after each sync.
          </p>
        </div>
      </div>

      {/* Credentials Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h4 className="font-medium text-amber-800 mb-2">Configuration Required</h4>
        <p className="text-sm text-amber-700">
          To enable automated data pulls, ensure your Aloha Enterprise and NetChex credentials
          are configured in the <code className="bg-amber-100 px-1 rounded">.env</code> file.
          The scraper will log into these systems using the provided credentials.
        </p>
      </div>
    </div>
  );
}
