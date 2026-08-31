import axios from "axios";
import crypto from "crypto";
import {
  WOMPI_BASE_URL,
  WOMPI_PUBLIC_KEY,
  WOMPI_PRIVATE_KEY,
  WOMPI_INTEGRITY_SECRET,
  WOMPI_EVENTS_SECRET,
  WOMPI_TIMEOUT,
} from "../config/wompi.js";


const wompiApi = axios.create({
  baseURL: WOMPI_BASE_URL,
  timeout: WOMPI_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
  },
});

export const obtenerAcceptanceToken = async () => {
  const { data } = await wompiApi.get(`/merchants/${WOMPI_PUBLIC_KEY}`);
  return data?.data?.presigned_acceptance?.acceptance_token;
};

export const calcularFirmaIntegridad = ({ referencia, montoEnCentavos, moneda = "COP" }) => {
  const cadena = `${referencia}${montoEnCentavos}${moneda}${WOMPI_INTEGRITY_SECRET}`;
  return crypto.createHash("sha256").update(cadena).digest("hex");
};

export function verificarFirmaWebhook({ propiedades, dataEvento, timestamp, checksumRecibido }) {
  const valoresConcatenados = propiedades
    .map((ruta) => ruta.split('.').reduce((obj, key) => obj?.[key], dataEvento))
    .join('');

  const cadena = `${valoresConcatenados}${timestamp}${WOMPI_EVENTS_SECRET}`;
  const checksumCalculado = crypto.createHash('sha256').update(cadena).digest('hex');

  return checksumCalculado.toUpperCase() === checksumRecibido?.toUpperCase();
}
export async function listarBancosPSE() {
  const { data } = await wompiApi.get('/pse/financial_institutions', {
    headers: { Authorization: `Bearer ${process.env.WOMPI_PUBLIC_KEY}` },
  });
  return data.data;}
export const crearTransaccion = async ({
  montoEnCentavos,
  moneda = "COP",
  referencia,
  emailCliente,
  acceptanceToken,
  firmaIntegridad,
  metodoPago,
}) => {
  const { data } = await wompiApi.post("/transactions", {
    amount_in_cents: montoEnCentavos,
    currency: moneda,
    customer_email: emailCliente,
    reference: referencia,
    acceptance_token: acceptanceToken,
    signature: firmaIntegridad,
    payment_method: metodoPago,
  });
  return data.data;
};

export const consultarTransaccion = async (idTransaccion) => {
  const { data } = await wompiApi.get(`/transactions/${idTransaccion}`);
  return data.data;
};

export default wompiApi;
