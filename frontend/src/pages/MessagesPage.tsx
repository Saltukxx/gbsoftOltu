import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/services/api'
import { websocketService } from '@/services/websocketService'
import { useAuthStore } from '@/stores/authStore'
import {
  MessageCircle,
  Mic,
  MicOff,
  Play,
  Pause,
  Send,
  Download,
  Volume2,
  Clock,
  User,
  Search,
  MoreVertical,
  Archive,
  Trash2,
  AlertTriangle,
  Plus,
  X,
  ArrowLeft,
  Check,
  CheckCheck
} from 'lucide-react'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { RoleGuard, UserRole, usePermission } from '@/components/guards/RoleGuard'
import { LoadingSpinner, PageLoading, LoadingButton } from '@/components/ui/LoadingStates'
import { useToast, useNetworkStatus } from '@/components/ui/Toast'
import type { Message, User as UserType } from '@/types'

interface AudioRecording {
  blob: Blob
  url: string
  duration: number
}

function MessagesPageContent() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [audioRecording, setAudioRecording] = useState<AudioRecording | null>(null)
  const [playingAudio, setPlayingAudio] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [messageFilter, setMessageFilter] = useState<'all' | 'unread' | 'urgent'>('all')
  const [showUserSelector, setShowUserSelector] = useState(false)
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [showConversations, setShowConversations] = useState(true)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { isOnline } = useNetworkStatus()

  // Fetch conversations - optimized
  const { data: conversationsResponse, isLoading, error } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      try {
        return await apiClient.get<{ success: boolean; data: any[] }>('/api/messages/conversations')
      } catch (err: any) {
        if (err?.code === 'ECONNREFUSED' || !err?.response) {
          throw new Error('Sunucuya bağlanılamıyor')
        }
        throw err
      }
    },
    enabled: isOnline,
    refetchInterval: isOnline ? 60000 : false, // Reduced to 60 seconds
    refetchOnWindowFocus: false,
    staleTime: 30000, // Consider data fresh for 30 seconds
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('Sunucuya bağlanılamıyor') || !error?.response) {
        return false
      }
      return failureCount < 2
    },
    onError: (error: any) => {
      if (!error?.message?.includes('Sunucuya bağlanılamıyor')) {
        toast.error('Konuşmalar alınamadı', error.message)
      }
    }
  })

  const conversations = conversationsResponse?.data

  // Fetch users for starting new conversations
  const { data: usersResponse } = useQuery({
    queryKey: ['users', userSearchTerm],
    queryFn: () => apiClient.get<{ success: boolean; data: any[] }>('/api/employees'),
    enabled: showUserSelector,
    retry: 2,
  })

  const users = usersResponse?.data?.map((emp: any) => emp.user).filter((u: UserType) => u.id !== user?.id) || []

  // Fetch messages for selected conversation - optimized
  const { data: messagesResponse } = useQuery({
    queryKey: ['messages', selectedConversation],
    queryFn: async () => {
      try {
        return await apiClient.get<{ success: boolean; data: Message[] }>(`/api/messages?conversationId=${selectedConversation}`)
      } catch (err: any) {
        if (err?.code === 'ECONNREFUSED' || !err?.response) {
          throw new Error('Sunucuya bağlanılamıyor')
        }
        throw err
      }
    },
    enabled: !!selectedConversation && isOnline,
    refetchOnWindowFocus: false,
    staleTime: 10000, // Consider data fresh for 10 seconds (messages update frequently via WebSocket)
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('Sunucuya bağlanılamıyor') || !error?.response) {
        return false
      }
      return failureCount < 1
    },
    onError: (error: any) => {
      if (!error?.message?.includes('Sunucuya bağlanılamıyor')) {
        toast.error('Mesajlar alınamadı', error.message)
      }
    }
  })

  const messages = messagesResponse?.data

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: (data: FormData) => apiClient.post('/api/messages', data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setNewMessage('')
      setAudioRecording(null)
      toast.success('Mesaj gönderildi')
    },
    onError: (error: any) => {
      toast.error('Mesaj gönderilemedi', error.message)
    }
  })

  // WebSocket integration
  useEffect(() => {
    const handleNewMessage = (message: Message) => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      
      if (selectedConversation !== message.conversationId && isOnline) {
        toast.info('Yeni mesaj', `${message.sender.firstName} ${message.sender.lastName}`)
      }
    }

    if (isOnline) {
      websocketService.subscribeToMessages()
      websocketService.onNewMessage(handleNewMessage)
    }

    return () => {
      websocketService.unsubscribeFromMessages()
    }
  }, [selectedConversation, queryClient])

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  useEffect(() => {
    if (selectedConversation) {
      setShowConversations(false)
    }
  }, [selectedConversation])

  // Audio recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)
        audio.onloadedmetadata = () => {
          setAudioRecording({
            blob: audioBlob,
            url: audioUrl,
            duration: audio.duration
          })
        }
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      toast.error('Mikrofon erişimi reddedildi')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const playAudio = (audioUrl: string, messageId: string) => {
    audioElementsRef.current.forEach((audio, id) => {
      if (id !== messageId) {
        audio.pause()
        audio.currentTime = 0
      }
    })

    let audio = audioElementsRef.current.get(messageId)
    if (!audio) {
      audio = new Audio(audioUrl)
      audioElementsRef.current.set(messageId, audio)
      audio.onended = () => setPlayingAudio(null)
    }

    if (playingAudio === messageId) {
      audio.pause()
      setPlayingAudio(null)
    } else {
      audio.play()
      setPlayingAudio(messageId)
    }
  }

  const sendMessage = async () => {
    if (!selectedConversation || (!newMessage.trim() && !audioRecording) || !isOnline) {
      return
    }

    const formData = new FormData()
    formData.append('conversationId', selectedConversation)
    formData.append('type', audioRecording ? 'VOICE' : 'TEXT')
    
    if (audioRecording) {
      formData.append('audioFile', audioRecording.blob, 'voice-message.wav')
      formData.append('duration', audioRecording.duration.toString())
    } else {
      formData.append('content', newMessage)
    }

    sendMessageMutation.mutate(formData)
  }

  const formatTime = (date: Date | string) => {
    const d = new Date(date)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const messageDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    
    if (messageDate.getTime() === today.getTime()) {
      return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Memoize filtered conversations
  const filteredConversations = useMemo(() => {
    if (!conversations) return []
    return conversations.filter(conv => {
      if (messageFilter === 'unread' && conv.unreadCount === 0) return false
      if (messageFilter === 'urgent' && conv.priority !== 'HIGH' && conv.priority !== 'URGENT') return false
      if (searchTerm && !conv.participants.some((p: UserType) => 
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
      )) return false
      return true
    })
  }, [conversations, messageFilter, searchTerm])

  if (isLoading) {
    return <PageLoading message="Mesajlar yükleniyor..." />
  }

  if (error) {
    return (
      <div className="card p-8">
        <div className="flex flex-col items-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-red-500" />
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900">Mesajlar Yüklenemedi</h3>
            <p className="text-sm text-gray-500 mt-1">Lütfen tekrar deneyin.</p>
          </div>
          <button 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['conversations'] })}
            className="btn btn-primary"
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    )
  }

  const selectedConv = filteredConversations.find(c => c.id === selectedConversation)

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Mesajlar</h1>
      </div>

      {/* Network Status */}
      {!isOnline && (
        <div className="mb-4 bg-orange-50 border border-orange-200 rounded-lg p-3">
          <div className="flex items-center text-sm text-orange-800">
            <AlertTriangle className="w-4 h-4 mr-2" />
            <span>İnternet bağlantısı yok</span>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden bg-white rounded-lg border border-gray-200 shadow-sm">
        {/* Conversations Sidebar */}
        <div className={`
          w-full lg:w-80 xl:w-96 border-r border-gray-200 flex flex-col bg-white
          ${showConversations ? 'flex' : 'hidden lg:flex'}
        `}>
          {/* Sidebar Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Konuşmalar</h2>
              <button
                onClick={() => setShowUserSelector(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Plus className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2">
              {['all', 'unread', 'urgent'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setMessageFilter(filter as any)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    messageFilter === filter
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {filter === 'all' ? 'Tümü' : filter === 'unread' ? 'Okunmamış' : 'Acil'}
                </button>
              ))}
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length > 0 ? (
              filteredConversations.map((conv) => {
                const otherUser = conv.participants.find((p: UserType) => p.id !== user?.id)
                const isSelected = selectedConversation === conv.id
                
                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      setSelectedConversation(conv.id)
                      setShowConversations(false)
                    }}
                    className={`
                      px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors
                      hover:bg-gray-50
                      ${isSelected ? 'bg-blue-50' : ''}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-medium text-sm">
                          {otherUser ? `${otherUser.firstName[0]}${otherUser.lastName[0]}` : 'U'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {otherUser ? `${otherUser.firstName} ${otherUser.lastName}` : 'Bilinmeyen'}
                          </p>
                          {conv.lastMessage && (
                            <span className="text-xs text-gray-500 ml-2">
                              {formatTime(conv.lastMessage.timestamp || conv.lastTimestamp)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-gray-600 truncate">
                            {conv.lastMessage?.type === 'VOICE' ? (
                              <span className="flex items-center gap-1">
                                <Volume2 className="w-3 h-3" />
                                Sesli mesaj
                              </span>
                            ) : (
                              conv.lastMessage?.content || 'Mesaj yok'
                            )}
                          </p>
                          {conv.unreadCount > 0 && (
                            <span className="bg-blue-600 text-white text-xs font-semibold rounded-full px-2 py-0.5 min-w-[20px] text-center">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <MessageCircle className="w-16 h-16 text-gray-300 mb-4" />
                <p className="text-sm font-medium text-gray-900 mb-1">Henüz konuşma yok</p>
                <button
                  onClick={() => setShowUserSelector(true)}
                  className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Yeni mesaj başlat
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 flex flex-col bg-gray-50">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="bg-white border-b border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => {
                        setShowConversations(true)
                        setSelectedConversation(null)
                      }}
                      className="lg:hidden p-2 -ml-2 hover:bg-gray-100 rounded-lg"
                    >
                      <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    {selectedConv && (
                      <>
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-medium text-sm">
                            {selectedConv.participants
                              .filter((p: UserType) => p.id !== user?.id)[0] 
                              ? `${selectedConv.participants.filter((p: UserType) => p.id !== user?.id)[0].firstName[0]}${selectedConv.participants.filter((p: UserType) => p.id !== user?.id)[0].lastName[0]}`
                              : 'U'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-gray-900 truncate">
                            {selectedConv.participants
                              .filter((p: UserType) => p.id !== user?.id)
                              .map((p: UserType) => `${p.firstName} ${p.lastName}`)
                              .join(', ')}
                          </h3>
                        </div>
                      </>
                    )}
                  </div>
                  <button className="p-2 hover:bg-gray-100 rounded-lg">
                    <MoreVertical className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages && messages.length > 0 ? (
                  [...messages].reverse().map((message) => {
                    const isOwn = message.sender.id === user?.id
                    
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[75%] sm:max-w-md ${isOwn ? 'flex flex-col items-end' : 'flex flex-col items-start'}`}>
                          {!isOwn && (
                            <span className="text-xs text-gray-500 mb-1 px-1">
                              {message.sender.firstName} {message.sender.lastName}
                            </span>
                          )}
                          <div
                            className={`rounded-2xl px-4 py-2 ${
                              isOwn
                                ? 'bg-blue-600 text-white rounded-br-md'
                                : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
                            }`}
                          >
                            {message.type === 'VOICE' ? (
                              <div className="flex items-center gap-3 min-w-[200px]">
                                <button
                                  onClick={() => playAudio(message.audioUrl!, message.id)}
                                  className={`p-2 rounded-full ${
                                    isOwn 
                                      ? 'bg-blue-700 hover:bg-blue-800' 
                                      : 'bg-gray-100 hover:bg-gray-200'
                                  }`}
                                >
                                  {playingAudio === message.id ? (
                                    <Pause className={`w-4 h-4 ${isOwn ? 'text-white' : 'text-gray-700'}`} />
                                  ) : (
                                    <Play className={`w-4 h-4 ${isOwn ? 'text-white' : 'text-gray-700'}`} />
                                  )}
                                </button>
                                <div className="flex-1">
                                  <div className={`h-1 rounded-full ${isOwn ? 'bg-blue-500' : 'bg-gray-200'}`}>
                                    <div className={`h-full rounded-full ${isOwn ? 'bg-white' : 'bg-blue-600'} w-1/3`}></div>
                                  </div>
                                  <p className={`text-xs mt-1 ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}>
                                    {formatDuration(message.duration || 0)}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                {message.content}
                              </p>
                            )}
                          </div>
                          <div className={`flex items-center gap-1 mt-1 px-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
                            <span className={`text-xs ${isOwn ? 'text-gray-500' : 'text-gray-400'}`}>
                              {formatTime(message.timestamp || message.createdAt)}
                            </span>
                            {isOwn && (
                              <span className="text-xs text-gray-500">
                                {message.readBy && message.readBy.length > 0 ? (
                                  <CheckCheck className="w-3 h-3 text-blue-600" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <MessageCircle className="w-16 h-16 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-600">Henüz mesaj yok</p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="bg-white border-t border-gray-200 p-4">
                {audioRecording && (
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Volume2 className="w-5 h-5 text-blue-600" />
                        <div>
                          <p className="text-sm font-medium text-blue-900">Ses kaydı</p>
                          <p className="text-xs text-blue-600">{formatDuration(audioRecording.duration)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => playAudio(audioRecording.url, 'preview')}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg"
                        >
                          {playingAudio === 'preview' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => {
                            URL.revokeObjectURL(audioRecording.url)
                            setAudioRecording(null)
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Mesaj yazın..."
                      disabled={!!audioRecording || !isOnline}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 min-h-[44px] max-h-32"
                      rows={1}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          sendMessage()
                        }
                      }}
                    />
                  </div>
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={!!audioRecording || !isOnline}
                    className={`p-3 rounded-lg transition-colors ${
                      isRecording
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } disabled:opacity-50`}
                  >
                    {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  <LoadingButton
                    onClick={sendMessage}
                    loading={sendMessageMutation.isPending}
                    disabled={(!newMessage.trim() && !audioRecording) || !isOnline}
                    variant="primary"
                    className="p-3 rounded-lg"
                  >
                    <Send className="w-5 h-5" />
                  </LoadingButton>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className="w-20 h-20 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Bir konuşma seçin</h3>
                <p className="text-sm text-gray-500 mb-6">Mesajlaşmaya başlamak için bir konuşma seçin</p>
                <button
                  onClick={() => setShowUserSelector(true)}
                  className="btn btn-primary"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Yeni Mesaj
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Selector Modal */}
      {showUserSelector && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowUserSelector(false)
            setUserSearchTerm('')
          }}
        >
          <div 
            className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Yeni Mesaj</h3>
              <button
                onClick={() => {
                  setShowUserSelector(false)
                  setUserSearchTerm('')
                }}
                className="p-1.5 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Kullanıcı ara..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {users.length > 0 ? (
                users
                  .filter((u: UserType) => 
                    !userSearchTerm || 
                    `${u.firstName} ${u.lastName}`.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                    u.email?.toLowerCase().includes(userSearchTerm.toLowerCase())
                  )
                  .map((u: UserType) => {
                    const conversationId = [user?.id, u.id].sort().join('-')
                    const existingConv = conversations?.find((c: any) => c.id === conversationId)
                    
                    return (
                      <button
                        key={u.id}
                        onClick={() => {
                          setSelectedConversation(conversationId)
                          setShowUserSelector(false)
                          setUserSearchTerm('')
                          setShowConversations(false)
                        }}
                        className="w-full p-3 text-left hover:bg-gray-50 rounded-lg flex items-center gap-3"
                      >
                        <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-medium text-sm">
                            {u.firstName[0]}{u.lastName[0]}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {u.firstName} {u.lastName}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{u.email}</p>
                        </div>
                        {existingConv && (
                          <span className="text-xs text-blue-600 font-medium">Devam et</span>
                        )}
                      </button>
                    )
                  })
              ) : (
                <div className="text-center py-12">
                  <User className="w-16 h-16 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-600">Kullanıcı bulunamadı</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MessagesPage() {
  return (
    <ErrorBoundary>
      <RoleGuard requiredRole={UserRole.MESSENGER}>
        <MessagesPageContent />
      </RoleGuard>
    </ErrorBoundary>
  )
}
