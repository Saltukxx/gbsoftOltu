import React from 'react'
import { Edit, Trash2, LogOut, LogIn, ArrowRightLeft, Settings } from 'lucide-react'
import type { WarehouseItem } from '@/types/warehouse'
import { categoryDisplayNames, conditionDisplayNames } from '@/types/warehouse'

interface ItemListProps {
  items: WarehouseItem[]
  isLoading?: boolean
  onEdit: (item: WarehouseItem) => void
  onDelete: (item: WarehouseItem) => void
  onCheckout: (item: WarehouseItem) => void
  onCheckin: (item: WarehouseItem) => void
  onTransfer: (item: WarehouseItem) => void
  onAdjust: (item: WarehouseItem) => void
  onViewDetail: (item: WarehouseItem) => void
}

export const ItemList: React.FC<ItemListProps> = ({
  items,
  isLoading,
  onEdit,
  onDelete,
  onCheckout,
  onCheckin,
  onTransfer,
  onAdjust,
  onViewDetail,
}) => {
  if (isLoading) {
    return (
      <div className="card p-6">
        <div className="text-center py-8 text-gray-500">Yükleniyor...</div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="card p-6">
        <div className="text-center py-8 text-gray-500">Henüz ürün bulunmuyor.</div>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ürün Adı
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Kategori
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SKU
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Miktar
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Konum
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Durum
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                İşlemler
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((item) => (
              <tr
                key={item.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => onViewDetail(item)}
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{item.name}</div>
                  {item.description && (
                    <div className="text-xs text-gray-500 truncate max-w-xs">
                      {item.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-gray-900">
                    {categoryDisplayNames[item.category]}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {item.sku || '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={`text-sm font-medium ${
                      item.quantity === 0
                        ? 'text-red-600'
                        : item.quantity < 10
                        ? 'text-orange-600'
                        : 'text-gray-900'
                    }`}
                  >
                    {item.quantity}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {item.location}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                    {conditionDisplayNames[item.condition]}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                  <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onEdit(item)}
                      className="text-blue-600 hover:text-blue-900 p-1"
                      title="Düzenle"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onCheckout(item)}
                      className="text-green-600 hover:text-green-900 p-1"
                      title="Çıkış"
                      disabled={item.quantity === 0}
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onCheckin(item)}
                      className="text-blue-600 hover:text-blue-900 p-1"
                      title="Giriş"
                    >
                      <LogIn className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onTransfer(item)}
                      className="text-purple-600 hover:text-purple-900 p-1"
                      title="Transfer"
                      disabled={item.quantity === 0}
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onAdjust(item)}
                      className="text-orange-600 hover:text-orange-900 p-1"
                      title="Düzeltme"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(item)}
                      className="text-red-600 hover:text-red-900 p-1"
                      title="Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

