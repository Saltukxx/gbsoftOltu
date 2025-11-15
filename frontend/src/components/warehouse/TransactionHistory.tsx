import React from 'react'
import type { WarehouseTransaction } from '@/types/warehouse'
import { transactionTypeDisplayNames } from '@/types/warehouse'
import { WarehouseTransactionType } from '@/types/warehouse'

interface TransactionHistoryProps {
  transactions: WarehouseTransaction[]
  isLoading?: boolean
}

const transactionTypeColors: Record<WarehouseTransactionType, string> = {
  [WarehouseTransactionType.CHECK_IN]: 'bg-green-100 text-green-800',
  [WarehouseTransactionType.CHECK_OUT]: 'bg-blue-100 text-blue-800',
  [WarehouseTransactionType.TRANSFER]: 'bg-purple-100 text-purple-800',
  [WarehouseTransactionType.ADJUSTMENT]: 'bg-orange-100 text-orange-800',
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  transactions,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">İşlem Geçmişi</h3>
        <div className="text-center py-8 text-gray-500">Yükleniyor...</div>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">İşlem Geçmişi</h3>
        <div className="text-center py-8 text-gray-500">Henüz işlem kaydı bulunmuyor.</div>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">İşlem Geçmişi</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tarih
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tip
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Miktar
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Önceki
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Yeni
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Kullanıcı
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Notlar
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transactions.map((transaction) => (
              <tr key={transaction.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {new Date(transaction.createdAt).toLocaleString('tr-TR', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      transactionTypeColors[transaction.type]
                    }`}
                  >
                    {transactionTypeDisplayNames[transaction.type]}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {transaction.quantity}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {transaction.previousQuantity}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                  {transaction.newQuantity}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {transaction.user
                    ? `${transaction.user.firstName} ${transaction.user.lastName}`
                    : '-'}
                  {transaction.assignedUser && (
                    <div className="text-xs text-gray-500 mt-1">
                      → {transaction.assignedUser.firstName} {transaction.assignedUser.lastName}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {transaction.notes || '-'}
                  {transaction.transferToLocation && (
                    <div className="text-xs text-gray-400 mt-1">
                      → {transaction.transferToLocation}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

