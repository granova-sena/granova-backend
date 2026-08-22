import crypto from "crypto"

export const generarFirmaIntegridad = (referencia, montoCentavos) => {
  const cadena = `${referencia}${montoCentavos}COP${process.env.WOMPI_INTEGRITY_SECRET}`
  return crypto.createHash("sha256").update(cadena).digest("hex")
}
export const WOMPI_BASE_URL = process.env.WOMPI_BASE_URL || "https://sandbox.wompi.co/v1"

export const headersWompi = () => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.WOMPI_PRIVATE_KEY}`
})

export const obtenerAcceptanceToken = async () => {
  const respuesta = await fetch(`${WOMPI_BASE_URL}/merchants/${process.env.WOMPI_PUBLIC_KEY}`, {
    headers: { "Content-Type": "application/json" }
  })
  const datos = await respuesta.json()
  return datos.data?.presigned_acceptance?.acceptance_token
}