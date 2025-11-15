import { io, Socket } from 'socket.io-client'
import type { WebSocketMessage } from '@/types'
import { useAuthStore } from '@/stores/authStore'

class WebSocketService {
  private socket: Socket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectInterval = 5000
  private subscriptions: Map<string, Function[]> = new Map()
  private isCleaningUp = false

  connect() {
    const token = useAuthStore.getState().accessToken
    
    if (!token) {
      console.warn('No auth token available for WebSocket connection')
      return
    }

    const wsUrl = import.meta.env.VITE_WS_URL || 'http://localhost:3001'

    this.socket = io(wsUrl, {
      auth: {
        token
      },
      transports: ['websocket'],
    })

    this.setupEventHandlers()
  }

  private setupEventHandlers() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.log('WebSocket connected')
      this.reconnectAttempts = 0
    })

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason)
      this.handleReconnect()
    })

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error)
      this.handleReconnect()
    })

    // Generic message handler
    this.socket.onAny((eventName, data) => {
      console.log(`WebSocket event: ${eventName}`, data)
    })
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
      
      setTimeout(() => {
        this.connect()
      }, this.reconnectInterval)
    } else {
      console.error('Max reconnection attempts reached')
    }
  }

  disconnect() {
    this.isCleaningUp = true
    this.cleanupSubscriptions()
    
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    
    this.isCleaningUp = false
  }

  private cleanupSubscriptions() {
    // Remove all event listeners
    this.subscriptions.forEach((callbacks, event) => {
      callbacks.forEach(callback => {
        this.socket?.off(event, callback as any)
      })
    })
    
    // Clear subscriptions map
    this.subscriptions.clear()
  }

  private addSubscription(event: string, callback: Function) {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, [])
    }
    this.subscriptions.get(event)!.push(callback)
  }

  private removeSubscription(event: string, callback?: Function) {
    if (!this.subscriptions.has(event)) return
    
    const callbacks = this.subscriptions.get(event)!
    if (callback) {
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    } else {
      // Remove all callbacks for this event
      callbacks.length = 0
    }
    
    // Clean up empty arrays
    if (callbacks.length === 0) {
      this.subscriptions.delete(event)
    }
  }

  // Subscribe to shift updates
  subscribeToShifts() {
    this.socket?.emit('shift:subscribe')
  }

  unsubscribeFromShifts() {
    this.socket?.emit('shift:unsubscribe')
    // Clean up shift listeners to prevent memory leaks
    this.removeSubscription('shift:updated')
    this.removeSubscription('shift:bulk-updated')
  }

  onShiftUpdate(callback: (data: WebSocketMessage) => void) {
    this.socket?.on('shift:updated', callback)
    this.socket?.on('shift:bulk-updated', callback)
    this.addSubscription('shift:updated', callback)
    this.addSubscription('shift:bulk-updated', callback)
  }
  
  offShiftUpdate(callback?: (data: WebSocketMessage) => void) {
    this.socket?.off('shift:updated', callback as any)
    this.socket?.off('shift:bulk-updated', callback as any)
    if (callback) {
      this.removeSubscription('shift:updated', callback)
      this.removeSubscription('shift:bulk-updated', callback)
    } else {
      this.removeSubscription('shift:updated')
      this.removeSubscription('shift:bulk-updated')
    }
  }

  // Subscribe to vehicle updates
  subscribeToVehicles(vehicleIds: string[]) {
    this.socket?.emit('vehicle:subscribe', vehicleIds)
  }

  unsubscribeFromVehicles(vehicleIds: string[]) {
    this.socket?.emit('vehicle:unsubscribe', vehicleIds)
  }

  onVehicleLocation(callback: (data: WebSocketMessage) => void) {
    this.socket?.on('vehicle:location', callback)
    this.addSubscription('vehicle:location', callback)
  }

  onTelemetryAlert(callback: (data: WebSocketMessage) => void) {
    this.socket?.on('telemetry:alert', callback)
    this.addSubscription('telemetry:alert', callback)
  }

  // Additional telemetry data handler
  onTelemetryData(callback: (data: WebSocketMessage) => void) {
    this.socket?.on('vehicle:telemetry', callback)
    this.addSubscription('vehicle:telemetry', callback)
  }

  // Subscribe to message updates
  subscribeToMessages() {
    this.socket?.emit('message:subscribe')
  }

  onNewMessage(callback: (data: WebSocketMessage) => void) {
    this.socket?.on('message:new', callback)
    this.addSubscription('message:new', callback)
  }

  unsubscribeFromMessages() {
    this.socket?.emit('message:unsubscribe')
    this.removeSubscription('message:new')
    this.removeSubscription('message:typing')
    this.removeSubscription('message:stop-typing')
  }

  // Typing indicators for messages
  startTyping(receiverId: string) {
    this.socket?.emit('message:typing', { receiverId })
  }

  stopTyping(receiverId: string) {
    this.socket?.emit('message:stop-typing', { receiverId })
  }

  onTyping(callback: (data: { senderId: string; timestamp: string }) => void) {
    this.socket?.on('message:typing', callback)
    this.addSubscription('message:typing', callback)
  }

  onStopTyping(callback: (data: { senderId: string; timestamp: string }) => void) {
    this.socket?.on('message:stop-typing', callback)
    this.addSubscription('message:stop-typing', callback)
  }

  // Combined typing indicator handler for frontend compatibility
  onTypingIndicator(callback: (data: { userId: string; conversationId: string; isTyping: boolean }) => void) {
    const typingHandler = (data: any) => {
      callback({
        userId: data.senderId,
        conversationId: data.conversationId || 'unknown',
        isTyping: true
      });
    };
    
    const stopTypingHandler = (data: any) => {
      callback({
        userId: data.senderId,
        conversationId: data.conversationId || 'unknown',
        isTyping: false
      });
    };
    
    // Handle both start and stop typing events
    this.socket?.on('message:typing', typingHandler);
    this.socket?.on('message:stop-typing', stopTypingHandler);
    
    // Track subscriptions for cleanup
    this.addSubscription('message:typing', typingHandler);
    this.addSubscription('message:stop-typing', stopTypingHandler);
  }

  // Generic event listeners
  on(event: string, callback: (data: any) => void) {
    this.socket?.on(event, callback)
    this.addSubscription(event, callback)
  }

  off(event: string, callback?: (data: any) => void) {
    this.socket?.off(event, callback as any)
    if (callback) {
      this.removeSubscription(event, callback)
    } else {
      this.removeSubscription(event)
    }
  }

  emit(event: string, data?: any) {
    this.socket?.emit(event, data)
  }

  isConnected(): boolean {
    return this.socket?.connected || false
  }
}

export const websocketService = new WebSocketService()