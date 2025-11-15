import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { AdjustmentInput } from '@/types/warehouse'

interface AdjustmentModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: AdjustmentInput) => Promise<void>
  currentQuantity: number
}

export const AdjustmentModal: React.FC<AdjustmentModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  currentQuantity,
}) => {
  const [newQuantity, setNewQuantity] = useState(currentQuantity)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setNewQuantity(currentQuantity)
      setNotes('')
    }
  }, [isOpen, currentQuantity])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newQuantity < 0 || !notes.trim()) return

    setIsSubmitting(true)
    try {
      await onSubmit({
        newQuantity,
        notes: notes.trim(),
      })
      setNotes('')
      onClose()
    } catch (error) {
      // Error handled by parent
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  const difference = newQuantity - currentQuantity

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Miktar Düzeltmesi</h2>
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
              Mevcut Miktar
            </label>
            <input
              type="number"
              value={currentQuantity}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
              disabled
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Yeni Miktar <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={newQuantity}
              onChange={(e) => setNewQuantity(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min={0}
              required
            />
            {difference !== 0 && (
              <p className={`text-xs mt-1 ${difference > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {difference > 0 ? '+' : ''}{difference} değişiklik
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notlar <span className="text-red-500">*</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              required
              placeholder="Düzeltme nedeni..."
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
              className="px-4 py-2 text-white bg-orange-600 rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting || newQuantity < 0 || !notes.trim()}
            >
              {isSubmitting ? 'İşleniyor...' : 'Düzelt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

