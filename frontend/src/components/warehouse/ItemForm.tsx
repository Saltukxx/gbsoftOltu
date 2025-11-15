import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type {
  WarehouseItem,
  WarehouseItemCreateInput,
  WarehouseItemUpdateInput,
  WarehouseItemCategory,
  WarehouseItemCondition,
} from '@/types/warehouse'
import {
  WarehouseItemCategory as CategoryEnum,
  WarehouseItemCondition as ConditionEnum,
  categoryDisplayNames,
  conditionDisplayNames,
} from '@/types/warehouse'

interface ItemFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: WarehouseItemCreateInput | WarehouseItemUpdateInput) => Promise<void>
  item?: WarehouseItem
}

export const ItemForm: React.FC<ItemFormProps> = ({ isOpen, onClose, onSubmit, item }) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<WarehouseItemCategory>(CategoryEnum.OTHER)
  const [sku, setSku] = useState('')
  const [quantity, setQuantity] = useState(0)
  const [location, setLocation] = useState('')
  const [condition, setCondition] = useState<WarehouseItemCondition>(ConditionEnum.GOOD)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setName(item.name)
        setDescription(item.description || '')
        setCategory(item.category)
        setSku(item.sku || '')
        setQuantity(item.quantity)
        setLocation(item.location)
        setCondition(item.condition)
      } else {
        setName('')
        setDescription('')
        setCategory(CategoryEnum.OTHER)
        setSku('')
        setQuantity(0)
        setLocation('')
        setCondition(ConditionEnum.GOOD)
      }
    }
  }, [isOpen, item])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !location.trim()) return

    setIsSubmitting(true)
    try {
      if (item) {
        await onSubmit({
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          sku: sku.trim() || undefined,
          location: location.trim(),
          condition,
        })
      } else {
        await onSubmit({
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          sku: sku.trim() || undefined,
          quantity,
          location: location.trim(),
          condition,
        })
      }
      onClose()
    } catch (error) {
      // Error handled by parent
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">
            {item ? 'Ürünü Düzenle' : 'Yeni Ürün Ekle'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ürün Adı <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Açıklama
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kategori <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as WarehouseItemCategory)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {Object.values(CategoryEnum).map((cat) => (
                  <option key={cat} value={cat}>
                    {categoryDisplayNames[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Durum <span className="text-red-500">*</span>
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as WarehouseItemCondition)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {Object.values(ConditionEnum).map((cond) => (
                  <option key={cond} value={cond}>
                    {conditionDisplayNames[cond]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                SKU
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {!item && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Miktar <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={0}
                  required
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Konum <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              disabled={isSubmitting}
            >
              İptal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Kaydediliyor...' : item ? 'Güncelle' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

