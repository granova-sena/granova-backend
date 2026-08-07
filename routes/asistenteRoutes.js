import express from "express"
import { chatConAsistente, chatConAsistenteCliente } from "../controllers/AsistenteController.js"

const router = express.Router()

router.post("/chat", chatConAsistente)
router.post("/chat-cliente", chatConAsistenteCliente)

export default router