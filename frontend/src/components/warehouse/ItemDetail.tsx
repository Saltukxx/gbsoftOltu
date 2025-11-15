import React from 'react'
import { X } from 'lucide-react'
import type { WarehouseItem } from '@/types/warehouse'
import { categoryDisplayNames, conditionDisplayNames } from '@/types/warehouse'
import { TransactionHistory } from './TransactionHistory'

interface ItemDetailProps {
  item: WarehouseItem | null
  isOpen: boolean
  onClose: () => void
}

export const ItemDetail: React.FC<ItemDetailProps> = ({ item, isOpen, onClose }) => {
  if (!isOpen || !item) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">{item.name}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Kategori</label>
              <p className="text-sm text-gray-900">{categoryDisplayNames[item.category]}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">SKU</label>
              <p className="text-sm text-gray-900">{item.sku || '-'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Miktar</label>
              <p className="text-sm font-medium text-gray-900">{item.quantity}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Konum</label>
              <p className="text-sm text-gray-900">{item.location}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Durum</label>
              <p className="text-sm text-gray-900">{conditionDisplayNames[item.condition]}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Aktif</label>
              <p className="text-sm text-gray-900">{item.isActive ? 'Evet' : 'Hayır'}</p>
            </div>
          </div>

          {item.description && (
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Açıklama</label>
              <p className="text-sm text-gray-900">{item.description}</p>
            </div>
          )}

          {item.transactions && item.transactions.length > 0 && (
            <TransactionHistory transactions={item.transactions} />
          )}
        </div>
      </div>
    </div>
  )
}

