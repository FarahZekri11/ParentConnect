import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Post, Comment } from '../../types';
import { postsApi } from '../../api/endpoints';
import { useAuth } from '../../contexts/AuthContext';

export const PostDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Modale signalement
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [reportReason, setReportReason] = useState<string>('Contenu inapproprié');
  const [reportDetails, setReportDetails] = useState<string>('');
  const [reportSuccess, setReportSuccess] = useState<boolean>(false);

  const { hasRole } = useAuth();

  const loadPostAndComments = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const [fetchedPost, fetchedComments] = await Promise.all([
        postsApi.getPostById(id),
        postsApi.getComments(id),
      ]);
      setPost(fetchedPost);
      setComments(fetchedComments);
    } catch (err) {
      console.error('Erreur chargement détail post:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPostAndComments();
  }, [id]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !newComment.trim()) return;

    setIsSubmitting(true);
    try {
      const added = await postsApi.addComment(id, { content: newComment });
      setComments([...comments, added]);
      setNewComment('');
    } catch (err) {
      console.error('Erreur ajout commentaire:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReportPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    try {
      await postsApi.reportPost(id, {
        reason: reportReason,
        details: reportDetails || undefined,
      });
      setReportSuccess(true);
      setTimeout(() => {
        setShowReportModal(false);
        setReportSuccess(false);
      }, 1500);
    } catch (err) {
      console.error('Erreur signalement:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="text-center py-12 bg-white rounded-xl p-8">
        <p className="text-gray-500">Post introuvable ou supprimé.</p>
        <Link to="/" className="mt-4 inline-block text-blue-600 hover:underline">
          ← Retour au fil d'actualité
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/" className="text-sm text-gray-500 hover:text-blue-600 font-medium">
        ← Retour aux discussions
      </Link>

      {/* Post principal */}
      <article className="bg-white p-6 sm:p-8 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg">
              {post.authorName ? post.authorName[0].toUpperCase() : 'U'}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{post.authorName}</h3>
              <span className="text-xs text-gray-400">
                {new Date(post.createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {post.categoryName && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                {post.categoryName}
              </span>
            )}

            {hasRole(['PARENT', 'PROFESSIONAL', 'ADMIN']) && (
              <button
                onClick={() => setShowReportModal(true)}
                className="text-xs text-gray-400 hover:text-red-600 p-1"
                title="Signaler ce post"
              >
                ⚠️ Signaler
              </button>
            )}
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mt-6">{post.title}</h1>
        <div className="mt-4 text-gray-700 leading-relaxed whitespace-pre-line">{post.content}</div>
      </article>

      {/* Section Commentaires */}
      <section className="bg-white p-6 sm:p-8 rounded-xl border border-gray-100 shadow-sm space-y-6">
        <h2 className="text-xl font-bold text-gray-900">
          Commentaires ({comments.length})
        </h2>

        {/* Formulaire ajout commentaire */}
        {hasRole(['PARENT', 'PROFESSIONAL', 'ADMIN']) ? (
          <form onSubmit={handleAddComment} className="space-y-3">
            <textarea
              required
              rows={3}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Écrire une réponse bienveillante..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting || !newComment.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {isSubmitting ? 'Envoi...' : 'Commenter'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600 text-center">
            <Link to="/login" className="text-blue-600 hover:underline font-semibold">
              Connectez-vous
            </Link>{' '}
            pour participer à cette discussion.
          </div>
        )}

        {/* Liste des commentaires */}
        <div className="divide-y divide-gray-100 pt-2">
          {comments.map((comment) => (
            <div key={comment.id} className="py-4 first:pt-0">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-sm text-gray-900">{comment.authorName}</span>
                <span className="text-xs text-gray-400">
                  {new Date(comment.createdAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-700">{comment.content}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Modale de signalement */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Signaler ce contenu</h3>
            {reportSuccess ? (
              <div className="p-4 bg-green-50 text-green-700 rounded-md text-sm text-center">
                Merci. Votre signalement a été transmis aux modérateurs.
              </div>
            ) : (
              <form onSubmit={handleReportPost} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Motif</label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  >
                    <option value="Contenu inapproprié">Contenu inapproprié</option>
                    <option value="Spam ou publicité">Spam ou publicité</option>
                    <option value="Harcèlement ou propos haineux">Harcèlement ou propos haineux</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Détails facultatifs</label>
                  <textarea
                    rows={3}
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    placeholder="Précisez pourquoi vous signalez ce message..."
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium"
                  >
                    Envoyer le signalement
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
