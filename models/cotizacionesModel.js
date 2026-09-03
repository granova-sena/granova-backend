import{pool} from "../config/db.js"
export const insertarCotizacion = (client,{
    id_cliente, numero_cotizacion, subtotal, descuento, total,
    descuento_pct, descuento_fuente, fecha_validez,
}) =>
    client.query(
        `INSERT INTO cotizaciones
            (id_cliente, numero_cotizacion, subtotal, descuento, total, descuento_pct, descuento_fuente, fecha_validez)
        vALUES($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [id_cliente, numero_cotizacion, subtotal, descuento, total, descuento_pct, descuento_fuente, fecha_validez]
    );

export const listarCotizacionesPorCliente = (id_cliente, limit, offset) =>
    pool.query(`
    SELECT id_cotizacion, numero_cotizacion, total, estado, fecha_creacion, fecha_validez, id_pedido
    FROM cotizaciones
    WHERE id_cliente = $1
    ORDER BY fecha_creacion DESC
    LIMIT $2 OFFSET $3`,
    [id_cliente, limit, offset]
);

export const contarCotizacionesPorCliente = (id_cliente) =>
    pool.query(`SELECT COUNT(*)
        FROM cotizaciones
        WHERE id_cliente = $1`,
    [id_cliente]
);

export const buscarCotizacionPorId = (id_cotizacion) => 
    pool.query(`SELECT * 
        FROM cotizaciones
        WHERE id_cotizacion = $1`,
    [id_cotizacion]
);

export const marcarCotizacionComprada = (client, id_cotizacion, id_pedido) =>
    client.query(`
        UPDATE cotizaciones
        SET estado = 'comprada', id_pedido = $2
        WHERE id_cotizacion = $1`,
    [id_cotizacion, id_pedido]
);

export const eliminarCotizacion = (id_cotizacion, id_cliente) =>
    pool.query(
        `UPDATE cotizaciones 
        SET estado = 'eliminada'
        WHERE id_cotizacion = $1 AND id_cliente = $2
        `,
        [id_cotizacion, id_cliente]
    );