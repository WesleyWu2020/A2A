'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Trash2, ShoppingBag, X, Package } from 'lucide-react';
import { useProjectStore } from '@/store';
import { FavoriteItem } from '@/types';

interface FavoritesPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FavoritesPanel({ isOpen, onClose }: FavoritesPanelProps) {
  const { activeProject, removeFavorite } = useProjectStore();
  const [selectedFavorite, setSelectedFavorite] = useState<FavoriteItem | null>(null);

  const favorites = activeProject?.favorites || [];

  const closePanel = () => {
    setSelectedFavorite(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={closePanel}
        >
          <motion.div
            initial={{ scale: 0.95, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 16 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Heart className="h-5 w-5 text-rose-500" />
                Favorites
                {activeProject && (
                  <span className="text-xs font-normal text-slate-400">
                    - {activeProject.icon} {activeProject.name}
                  </span>
                )}
              </h2>
              <button onClick={closePanel} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto px-5 py-3">
              {favorites.length === 0 ? (
                <div className="py-12 text-center">
                  <ShoppingBag className="mx-auto h-10 w-10 text-slate-200" />
                  <p className="mt-3 text-sm text-slate-400">
                    No favorites yet. Like products from scheme recommendations to build your references.
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    The AI uses your favorites to understand your taste.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {favorites.map((fav) => (
                    <div
                      key={fav.product_id}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 transition-colors hover:bg-slate-50"
                    >
                      <button
                        onClick={() => setSelectedFavorite(fav)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        {fav.image_url ? (
                          <img
                            src={fav.image_url}
                            alt={fav.product_name}
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100">
                            <Package className="h-5 w-5 text-slate-300" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{fav.product_name}</p>
                          <p className="text-xs text-slate-400">
                            {fav.price ? `$${fav.price.toFixed(0)}` : 'Price pending'}
                          </p>
                        </div>
                      </button>

                      <button
                        onClick={() => removeFavorite(fav.product_id)}
                        className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                        aria-label="Remove favorite"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {favorites.length > 0 && (
              <div className="border-t border-slate-100 px-5 py-3">
                <p className="text-xs text-slate-400">
                  {favorites.length} item{favorites.length > 1 ? 's' : ''} saved - These are used as style/price references by the AI when generating new recommendations.
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}

      {isOpen && selectedFavorite && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setSelectedFavorite(null)}
        >
          <motion.div
            initial={{ scale: 0.96, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 12 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">Product Details</h3>
              <button
                onClick={() => setSelectedFavorite(null)}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              <div className="relative mb-4 h-56 w-full overflow-hidden rounded-xl bg-slate-100">
                {selectedFavorite.image_url ? (
                  <img
                    src={selectedFavorite.image_url}
                    alt={selectedFavorite.product_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-10 w-10 text-slate-300" />
                  </div>
                )}
              </div>

              <h4 className="text-lg font-semibold text-slate-900">{selectedFavorite.product_name}</h4>
              <p className="mt-2 text-sm text-slate-500">Product ID: {selectedFavorite.product_id}</p>
              <p className="mt-1 text-sm font-medium text-slate-700">
                Price: {selectedFavorite.price ? `$${selectedFavorite.price.toFixed(2)}` : 'Pending'}
              </p>
              {selectedFavorite.reason && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {selectedFavorite.reason}
                </p>
              )}

              <div className="mt-4">
                <button
                  onClick={() => {
                    removeFavorite(selectedFavorite.product_id);
                    setSelectedFavorite(null);
                  }}
                  className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-50"
                >
                  Remove from Favorites
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
