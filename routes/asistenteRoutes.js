import express from "express"
import { chatConAsistente, chatConAsistenteCliente } from "../controllers/AsistenteController.js"
import { limitarPeticiones } from "../middleware/limitarPeticiones.js"

const router = express.Router()

// Máx. 20 mensajes por minuto por IP para evitar abusar del webhook de DeepSeek/n8n
const limiteChat = limitarPeticiones({ max: 20, ventanaMs: 60_000 })

router.post("/chat", limiteChat, chatConAsistente)
router.post("/chat-cliente", limiteChat, chatConAsistenteCliente)

export default router