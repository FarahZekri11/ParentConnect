import React, { useState, useEffect } from 'react';
import { Report } from '../../types';
import { adminApi } from '../../api/endpoints';

export const AdminReportsPage: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadReports = async () => {
    setIsLoading(true);
    try {
      const data = await adminApi.getReports();
      setReports(data);
    } catch (err) {
      console.error('Erreur chargement signalements:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleResolve = async (id: string, action: 'RESOLVE' | 'DISMISS') => {
    try {
      await adminApi.resolveReport(id, action);
      setActionSuccess(`Signalement ${action === 'RESOLVE' ? 'résolu' : 'ignoré'}`);
      setReports(reports.filter((r) => r.id !== id));
      setTimeout(() => setActionSuccess(null), 2000);
    } catch (err) {
      console.error('Erreur traitement signalement:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Console de Modération (ADMIN)</h1>
        <p className="text-sm text-gray-500 mt-1">
          Examinez les signalements émis par la communauté et prenez les mesures adéquates.
        </p>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm">
          {actionSuccess}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100 p-8">
          <p className="text-gray-500">Aucun signalement en attente. Tout est calme ! ✨</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Date</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Post ID</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Motif</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Détails</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    {new Date(report.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-blue-600">{report.postId}</td>
                  <td className="px-6 py-4 font-medium text-gray-900">{report.reason}</td>
                  <td className="px-6 py-4 text-gray-600">{report.details || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                    <button
                      onClick={() => handleResolve(report.id, 'RESOLVE')}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold"
                    >
                      Supprimer contenu
                    </button>
                    <button
                      onClick={() => handleResolve(report.id, 'DISMISS')}
                      className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-medium"
                    >
                      Ignorer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
