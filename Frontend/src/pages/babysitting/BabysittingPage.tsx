import React, { useState, useEffect } from 'react';
import { BabysittingBooking } from '../../types';
import { babysittingApi } from '../../api/endpoints';
import { useAuth } from '../../contexts/AuthContext';

export const BabysittingPage: React.FC = () => {
  const [bookings, setBookings] = useState<BabysittingBooking[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Formulaire création
  const [showModal, setShowModal] = useState<boolean>(false);
  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [childrenCount, setChildrenCount] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const { isAuthenticated } = useAuth();

  const loadBookings = async () => {
    setIsLoading(true);
    try {
      const data = await babysittingApi.getBookings();
      setBookings(data);
    } catch (err) {
      console.error('Erreur chargement babysitting:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await babysittingApi.createBooking({
        date,
        startTime,
        endTime,
        childrenCount,
        notes: notes || undefined,
      });
      setShowModal(false);
      setDate('');
      setStartTime('');
      setEndTime('');
      setChildrenCount(1);
      setNotes('');
      loadBookings();
    } catch (err) {
      console.error('Erreur création garde:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Garde d'enfants & Babysitting</h1>
          <p className="text-sm text-gray-500 mt-1">
            Trouvez des parents de confiance ou des professionnels pour garder vos enfants.
          </p>
        </div>

        {isAuthenticated && (
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm shadow transition"
          >
            + Demander une garde
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100 p-8">
          <p className="text-gray-500">Aucune demande de babysitting en cours.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-3"
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-900">
                  📅 {new Date(booking.date).toLocaleDateString('fr-FR')}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    booking.status === 'ACCEPTED'
                      ? 'bg-green-100 text-green-800'
                      : booking.status === 'REJECTED'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {booking.status}
                </span>
              </div>

              <div className="text-sm text-gray-600">
                ⏰ {booking.startTime} - {booking.endTime}
              </div>
              <div className="text-sm text-gray-600">
                👶 {booking.childrenCount} enfant(s)
              </div>
              {booking.notes && (
                <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded">{booking.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Demande */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Nouvelle demande de garde</h3>
            <form onSubmit={handleCreateBooking} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Date</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Début</label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fin</label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre d'enfants</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  required
                  value={childrenCount}
                  onChange={(e) => setChildrenCount(parseInt(e.target.value, 10))}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Instructions / Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="Ex: Enfants de 3 et 6 ans, dîner à réchauffer..."
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium disabled:opacity-50"
                >
                  {isSubmitting ? 'Envoi...' : 'Valider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
