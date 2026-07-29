import express from "express"
import { chatConAsistente } from "../controllers/AsistenteController.js"

const router = express.Router()

router.post("/chat", chatConAsistente)

export default router