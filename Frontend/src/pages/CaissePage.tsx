import React, { useEffect, useState } from 'react';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { getFirestoreDb } from '../firebase/config';

interface Article {
  name: string;
  price: number;
  emoji: string;
}

interface Sale {
  id: string;
  articleName: string;
  price: number;
  quantity: number;
  unitPrice: number;
  createdAt: Timestamp;
}

const articles: Article[] = [
  { name: 'Vin chaud', price: 2, emoji: '🍷' },
  { name: 'Chocolat chaud', price: 1, emoji: '☕' },
  { name: 'Choco Amaretto', price: 2, emoji: '🍫' },
  { name: 'Peket', price: 1, emoji: '🥃' },
  { name: 'Bière', price: 1, emoji: '🍺' },
];

const CaissePage: React.FC = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [todayTotal, setTodayTotal] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [todayBeers, setTodayBeers] = useState(0);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editQuantity, setEditQuantity] = useState(1);

  useEffect(() => {
    const db = getFirestoreDb();
    const q = query(
      collection(db, 'sales'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const salesData: Sale[] = [];
      snapshot.forEach((docSnap) => {
        salesData.push({ id: docSnap.id, ...docSnap.data() } as Sale);
      });
      setSales(salesData);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = today.getTime();

      const todaySales = salesData.filter((sale) => {
        const saleDate = sale.createdAt?.toMillis() || 0;
        return saleDate >= todayTimestamp;
      });

      const total = todaySales.reduce((sum, sale) => sum + sale.price, 0);
      const count = todaySales.reduce((sum, sale) => sum + (sale.quantity || 1), 0);
      const beers = todaySales
        .filter(sale => sale.articleName === 'Bière')
        .reduce((sum, sale) => sum + (sale.quantity || 1), 0);
      setTodayTotal(total);
      setTodayCount(count);
      setTodayBeers(beers);
    });

    return () => unsubscribe();
  }, []);

  const handleArticleClick = (article: Article) => {
    setSelectedArticle(article);
  };

  const handleSaleWithQuantity = async (quantity: number) => {
    if (!selectedArticle || loading) return;
    setLoading(true);

    try {
      const db = getFirestoreDb();
      
      // Tarif spécial pour Peket x6
      let totalPrice = selectedArticle.price * quantity;
      if (selectedArticle.name === 'Peket' && quantity === 6) {
        totalPrice = 5;
      }
      
      await addDoc(collection(db, 'sales'), {
        articleName: selectedArticle.name,
        unitPrice: selectedArticle.price,
        quantity,
        price: totalPrice,
        createdAt: serverTimestamp(),
      });
      setSelectedArticle(null);
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement de la vente:', error);
      alert('Erreur lors de l\'enregistrement');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSale = async (saleId: string) => {
    if (!confirm('Supprimer cette vente ?')) return;
    
    try {
      const db = getFirestoreDb();
      await deleteDoc(doc(db, 'sales', saleId));
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const handleEditSale = (sale: Sale) => {
    setEditingSale(sale);
    setEditQuantity(sale.quantity || 1);
  };

  const handleUpdateSale = async () => {
    if (!editingSale || editQuantity < 1) return;

    try {
      const db = getFirestoreDb();
      
      // Tarif spécial pour Peket x6
      let totalPrice = editingSale.unitPrice * editQuantity;
      if (editingSale.articleName === 'Peket' && editQuantity === 6) {
        totalPrice = 5;
      }
      
      await updateDoc(doc(db, 'sales', editingSale.id), {
        quantity: editQuantity,
        price: totalPrice,
      });
      setEditingSale(null);
    } catch (error) {
      console.error('Erreur lors de la modification:', error);
      alert('Erreur lors de la modification');
    }
  };

  const formatTime = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return '';
    return timestamp.toDate().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    const today = new Date();
    
    if (date.toDateString() === today.toDateString()) {
      return 'Aujourd\'hui';
    }
    
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
    });
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🛒 Caisse Bar</h1>

      <div style={styles.statsContainer}>
        <div style={styles.statBox}>
          <div style={styles.statValue}>{todayCount}</div>
          <div style={styles.statLabel}>Ventes</div>
        </div>
        <div style={{ ...styles.statBox, ...styles.statBoxHighlight }}>
          <div style={styles.statValue}>{todayTotal.toFixed(2)} €</div>
          <div style={styles.statLabel}>Total du jour</div>
        </div>
        <div style={{ ...styles.statBox, ...styles.statBoxBeer }}>
          <div style={styles.statValue}>🍺 {todayBeers}</div>
          <div style={styles.statLabel}>Bières</div>
        </div>
      </div>

      <div style={styles.articlesGrid}>
        {articles.map((article) => (
          <button
            key={article.name}
            onClick={() => handleArticleClick(article)}
            disabled={loading}
            style={styles.articleButton}
          >
            <div style={styles.emoji}>{article.emoji}</div>
            <div style={styles.articleName}>{article.name}</div>
            <div style={styles.articlePrice}>{article.price.toFixed(2)} €</div>
          </button>
        ))}
      </div>

      {selectedArticle && (
        <div style={styles.modalOverlay} onClick={() => setSelectedArticle(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              {selectedArticle.emoji} {selectedArticle.name}
            </h3>
            <p style={styles.modalSubtitle}>{selectedArticle.price.toFixed(2)} € l'unité</p>
            <div style={styles.quantityGrid}>
              {[1, 2, 3, 4, 5, 6].map((qty) => {
                // Tarif spécial pour Peket x6
                let displayPrice = selectedArticle.price * qty;
                if (selectedArticle.name === 'Peket' && qty === 6) {
                  displayPrice = 5;
                }
                
                return (
                  <button
                    key={qty}
                    onClick={() => handleSaleWithQuantity(qty)}
                    style={styles.quantityButton}
                    disabled={loading}
                  >
                    <div style={styles.quantityNumber}>{qty}</div>
                    <div style={styles.quantityTotal}>
                      {displayPrice.toFixed(2)} €
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setSelectedArticle(null)}
              style={styles.cancelButton}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {editingSale && (
        <div style={styles.modalOverlay} onClick={() => setEditingSale(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Modifier la quantité</h3>
            <p style={styles.modalSubtitle}>{editingSale.articleName}</p>
            <div style={styles.quantityGrid}>
              {[1, 2, 3, 4, 5, 6].map((qty) => {
                // Tarif spécial pour Peket x6
                let displayPrice = editingSale.unitPrice * qty;
                if (editingSale.articleName === 'Peket' && qty === 6) {
                  displayPrice = 5;
                }
                
                return (
                  <button
                    key={qty}
                    onClick={() => setEditQuantity(qty)}
                    style={{
                      ...styles.quantityButton,
                      ...(editQuantity === qty ? styles.quantityButtonActive : {}),
                    }}
                  >
                    <div style={styles.quantityNumber}>{qty}</div>
                    <div style={styles.quantityTotal}>
                      {displayPrice.toFixed(2)} €
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={styles.modalActions}>
              <button onClick={handleUpdateSale} style={styles.saveButton}>
                Enregistrer
              </button>
              <button onClick={() => setEditingSale(null)} style={styles.cancelButton}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.recapContainer}>
        <h2 style={styles.recapTitle}>📋 Dernières ventes</h2>
        <div style={styles.salesList}>
          {sales.length === 0 && (
            <div style={styles.emptySales}>Aucune vente enregistrée</div>
          )}
          {sales.map((sale) => (
            <div key={sale.id} style={styles.saleItem}>
              <div style={styles.saleInfo}>
                <span style={styles.saleArticle}>
                  {sale.articleName}
                  {sale.quantity > 1 && (
                    <span style={styles.quantityBadge}> x{sale.quantity}</span>
                  )}
                </span>
                <span style={styles.saleDate}>
                  {formatDate(sale.createdAt)} à {formatTime(sale.createdAt)}
                </span>
              </div>
              <div style={styles.saleActions}>
                <div style={styles.salePrice}>{sale.price.toFixed(2)} €</div>
                <div style={styles.actionButtons}>
                  <button
                    onClick={() => handleEditSale(sale)}
                    style={styles.editButton}
                    title="Modifier"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteSale(sale.id)}
                    style={styles.deleteButton}
                    title="Supprimer"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '2rem 1rem',
  },
  title: {
    textAlign: 'center',
    fontSize: '2rem',
    marginBottom: '2rem',
    color: '#646cff',
  },
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem',
  },
  statBox: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '1.5rem',
    borderRadius: '12px',
    textAlign: 'center',
    color: 'white',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },
  statBoxHighlight: {
    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  },
  statBoxBeer: {
    background: 'linear-gradient(135deg, #ffc837 0%, #ff8008 100%)',
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem',
  },
  statLabel: {
    fontSize: '0.9rem',
    opacity: 0.9,
  },
  articlesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1rem',
    marginBottom: '3rem',
  },
  articleButton: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '12px',
    padding: '1.5rem 1rem',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    color: 'white',
    fontSize: '1rem',
    fontWeight: '600',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
  },
  emoji: {
    fontSize: '2.5rem',
  },
  articleName: {
    fontSize: '1rem',
    fontWeight: '600',
  },
  articlePrice: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    marginTop: '0.25rem',
  },
  recapContainer: {
    background: '#f8f9fa',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  recapTitle: {
    fontSize: '1.5rem',
    marginTop: 0,
    marginBottom: '1rem',
    color: '#333',
  },
  salesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  emptySales: {
    textAlign: 'center',
    padding: '2rem',
    color: '#666',
    fontStyle: 'italic',
  },
  saleItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  saleInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    flex: 1,
  },
  saleArticle: {
    fontWeight: '600',
    color: '#333',
    fontSize: '1rem',
  },
  quantityBadge: {
    background: '#667eea',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '0.85rem',
    marginLeft: '8px',
    fontWeight: '700',
  },
  saleDate: {
    fontSize: '0.8rem',
    color: '#666',
  },
  saleActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  salePrice: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  actionButtons: {
    display: 'flex',
    gap: '0.5rem',
  },
  editButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1.25rem',
    padding: '0.25rem',
    transition: 'transform 0.1s',
  },
  deleteButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1.25rem',
    padding: '0.25rem',
    transition: 'transform 0.1s',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: 'white',
    padding: '2rem',
    borderRadius: '16px',
    maxWidth: '500px',
    width: '90%',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  },
  modalTitle: {
    margin: 0,
    marginBottom: '0.5rem',
    fontSize: '1.5rem',
    textAlign: 'center',
    color: '#333',
  },
  modalSubtitle: {
    margin: 0,
    marginBottom: '1.5rem',
    fontSize: '1rem',
    textAlign: 'center',
    color: '#666',
  },
  quantityGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  quantityButton: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '12px',
    padding: '1.25rem 0.5rem',
    cursor: 'pointer',
    color: 'white',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },
  quantityButtonActive: {
    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    transform: 'scale(1.05)',
  },
  quantityNumber: {
    fontSize: '2rem',
    fontWeight: 'bold',
    marginBottom: '0.25rem',
  },
  quantityTotal: {
    fontSize: '0.9rem',
    opacity: 0.9,
  },
  modalActions: {
    display: 'flex',
    gap: '1rem',
  },
  saveButton: {
    flex: 1,
    background: 'linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '0.75rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  cancelButton: {
    flex: 1,
    background: '#e0e0e0',
    color: '#333',
    border: 'none',
    borderRadius: '8px',
    padding: '0.75rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
};

export default CaissePage;
