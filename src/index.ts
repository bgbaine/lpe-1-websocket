import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { PrismaClient } from '@prisma/client'

const app = express()
const server = createServer(app)
const port = process.env.PORT || 3002

const prisma = new PrismaClient({
  errorFormat: 'minimal',
})

async function connectDatabase() {
  try {
    await prisma.$connect()
    console.log('✅ Conectado a banco com sucesso!')
  } catch (error) {
    console.error('❌ Falha ao conectar ao banco de dados:', error)
  }
}

// Configuração Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
})

interface ChatMessage {
  id: string
  ticketId: string
  senderId: string
  senderName: string
  senderType: 'funcionario' | 'admin'
  message: string
  timestamp: Date
}

// Socket.IO Events
io.on('connection', (socket) => {
  console.log('Usuário conectado:', socket.id)

  socket.on('join-ticket', (ticketId: string) => {
    socket.join(`ticket-${ticketId}`)
    console.log(`Socket ${socket.id} entrou na sala ticket-${ticketId}`)
    socket.emit('joined-ticket', ticketId)
  })

  socket.on('load-messages', async (ticketId: string) => {
    try {
      const messages = await prisma.chatMessage.findMany({
        where: { ticketId: parseInt(ticketId) },
        orderBy: { createdAt: 'asc' }
      })
      socket.emit('messages-loaded', messages)
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error)
      socket.emit('load-error', 'Erro ao carregar mensagens')
    }
  })

  socket.on('send-message', async (data: ChatMessage) => {
    try {
      const savedMessage = await prisma.chatMessage.create({
        data: {
          ticketId: parseInt(data.ticketId),
          senderId: data.senderId,
          senderType: data.senderType,
          message: data.message
        }
      })

      const messageWithMetadata = {
        ...savedMessage,
        senderName: data.senderName,
        timestamp: savedMessage.createdAt
      }

      io.to(`ticket-${data.ticketId}`).emit('new-message', messageWithMetadata)
    } catch (error) {
      console.error('Erro ao salvar mensagem:', error)
      socket.emit('message-error', 'Erro ao enviar mensagem')
    }
  })

  socket.on('leave-ticket', (ticketId: string) => {
    socket.leave(`ticket-${ticketId}`)
    console.log(`Socket ${socket.id} saiu da sala ticket-${ticketId}`)
  })

  socket.on('disconnect', () => {
    console.log('Usuário desconectado:', socket.id)
  })
})

// Middleware
app.use(express.json())
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}))

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Socket.IO Server Online',
    connections: io.engine.clientsCount,
    timestamp: new Date().toISOString()
  })
})

app.get('/', (req, res) => {
  res.json({
    message: 'HelpDesk Socket.IO Server',
    status: 'running',
    connections: io.engine.clientsCount
  })
})

// Start Server
server.listen(port, () => {
  console.log(`🚀 Socket.IO Server rodando na porta: ${port}`)
  connectDatabase()
})