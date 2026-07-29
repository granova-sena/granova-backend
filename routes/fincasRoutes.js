import express from "express"
import { listarFincas } from "../controllers/fincasController.js"
import { limitadorPublico } from "../middleware/rateLimiter.js"

const router = express.Router()

router.get("/", limitadorPublico, listarFincas)

export default router