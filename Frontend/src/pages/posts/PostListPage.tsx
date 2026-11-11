import React, { useState, useEffect } from 'react';
import { Post, Category } from '../../types';
import { postsApi, categoriesApi } from '../../api/endpoints';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';

export const PostListPage: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Formulaire nouveau post
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newContent, setNewContent] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('');
  const [isPosting, setIsPosting] = useState<boolean>(false);

  const { hasRole } = useAuth();

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fetchedPosts, fetchedCategories] = await Promise.all([
        postsApi.getPosts({ categoryId: selectedCategory || undefined }),
        categoriesApi.getCategories().catch(() => []),
      ]);
      setPosts(fetchedPosts);
      setCategories(fetchedCategories);
    } catch (err) {
      console.error('Erreur chargement posts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    setIsPosting(true);
    try {
      await postsApi.createPost({
        title: newTitle,
        content: newContent,
        categoryId: newCategory || undefined,
      });
      setShowCreateModal(false);
      setNewTitle('');
      setNewContent('');
      setNewCategory('');
      loadData();
    } catch (err) {
      console.error('Erreur création post:', err);
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête avec bouton d'action */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fil d'actualité & Discussions</h1>
          <p className="text-sm text-gray-500 mt-1">Échangez avec les parents et professionnels de votre région</p>
        </div>

        {hasRole(['PARENT', 'PROFESSIONAL', 'ADMIN']) && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm shadow transition"
          >
            + Publier un message
          </button>
        )}
      </div>

      {/* Filtre par catégorie */}
      {categories.length > 0 && (
        <div className="flex items-center space-x-2 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedCategory('')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              selectedCategory === ''
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Toutes
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                selectedCategory === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Liste des posts */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100 p-8">
          <p className="text-gray-500">Aucun message pour l'instant. Soyez le premier à lancer la discussion !</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    {post.authorName ? post.authorName[0].toUpperCase() : 'U'}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{post.authorName}</h3>
                    <span className="text-xs text-gray-400">
                      {new Date(post.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {post.categoryName && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    {post.categoryName}
                  </span>
                )}
              </div>

              <Link to={`/posts/${post.id}`}>
                <h2 className="text-lg font-bold text-gray-900 mt-4 hover:text-blue-600 transition">
                  {post.title}
                </h2>
                <p className="text-gray-600 mt-2 text-sm line-clamp-3">{post.content}</p>
              </Link>

              <div className="mt-4 pt-4 border-t border-gray-50 flex justify-between items-center text-xs text-gray-500">
                <Link to={`/posts/${post.id}`} className="hover:text-blue-600 font-medium">
                  💬 {post.commentsCount || 0} commentaire(s)
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Créer un Post */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Nouveau message</h3>
            <form onSubmit={handleCreatePost} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Titre *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="Ex: Recherche recommandation pédiatre quartier centre"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Catégorie</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                >
                  <option value="">Sélectionner une catégorie...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Contenu du message *</label>
                <textarea
                  required
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="Décrivez votre question ou annonce..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPosting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium disabled:opacity-50"
                >
                  {isPosting ? 'Publication...' : 'Publier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
