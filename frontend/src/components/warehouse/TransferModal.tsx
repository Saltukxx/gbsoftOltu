import React, { useState } from 'react'
import { X } from 'lucide-react'
import type { TransferInput } from '@/types/warehouse'

interface TransferModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: TransferInput) => Promise<void>
  currentLocation: string
  maxQuantity: number
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  currentLocation,
  maxQuantity,
}) => {
  const [transferToLocation, setTransferToLocation] = useState('')
  const [quantity, setQuantity] = useState(maxQuantity)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!transferToLocation.trim() || quantity < 1 || quantity > maxQuantity) return

    setIsSubmitting(true)
    try {
      await onSubmit({
        transferToLocation: transferToLocation.trim(),
        quantity: quantity !== maxQuantity ? quantity : undefined,
        notes: notes.trim() || undefined,
      })
      setTransferToLocation('')
      setQuantity(maxQuantity)
      setNotes('')
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
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Ürün Transferi</h2>
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
              Mevcut Konum
            </label>
            <input
              type="text"
              value={currentLocation}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
              disabled
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Transfer Edilecek Konum <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={transferToLocation}
              onChange={(e) => setTransferToLocation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Miktar
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || maxQuantity)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min={1}
              max={maxQuantity}
            />
            <p className="text-xs text-gray-500 mt-1">
              Mevcut: {maxQuantity} (Tümünü transfer etmek için boş bırakın)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notlar
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
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
              className="px-4 py-2 text-white bg-purple-600 rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting || !transferToLocation.trim() || quantity < 1 || quantity > maxQuantity}
            >
              {isSubmitting ? 'İşleniyor...' : 'Transfer Et'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

