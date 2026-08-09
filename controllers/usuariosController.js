import pool from "../config/db.js"
import bcrypt from "bcrypt"
import * as XLSX from "xlsx"

export async function listarUsuarios(req, res) {
    try {
        const resultado = await pool.query(
            `SELECT id_usuario, nombre, apellido, email, rol, estado
             FROM usuarios
             WHERE estado != 'eliminado'
             ORDER BY id_usuario DESC`
        )

        res.json(resultado.rows)

    } catch (error) {
        console.error("Error en listarUsuarios:", error)
        res.status(500).json({ error: "Error al obtener los usuarios" })
    }
}

export async function obtenerMetricas(req, res) {
    try {
        const totales = await pool.query(
            `SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE estado = 'activo')::int AS activos,
                COUNT(*) FILTER (WHERE estado = 'inactivo')::int AS inactivos
             FROM usuarios
             WHERE estado != 'eliminado'`
        )

        const porRol = await pool.query(
            `SELECT rol, COUNT(*)::int AS cantidad
             FROM usuarios
             WHERE estado != 'eliminado'
             GROUP BY rol
             ORDER BY cantidad DESC`
        )

        res.json({
            total: totales.rows[0].total,
            activos: totales.rows[0].activos,
            inactivos: totales.rows[0].inactivos,
            por_rol: porRol.rows,
        })

    } catch (error) {
        console.error("Error en obtenerMetricas:", error)
        res.status(500).json({ error: "Error al obtener las métricas de usuarios" })
    }
}

export async function cambiarEstadoUsuario(req, res) {
    try {
        const { id } = req.params

        const usuarioActual = await pool.query(
            `SELECT rol, estado FROM usuarios WHERE id_usuario = $1`,
            [id]
        )

        if (usuarioActual.rows.length === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" })
        }

        const { rol, estado } = usuarioActual.rows[0]

        // Si va a pasar de activo a inactivo y es admin, verificamos que no sea el único admin activo.
        if (rol === "admin" && estado === "activo") {
            const conteoAdminsActivos = await pool.query(
                `SELECT COUNT(*)::int AS total FROM usuarios WHERE rol = 'admin' AND estado = 'activo'`
            )

            if (conteoAdminsActivos.rows[0].total <= 1) {
                return res.status(400).json({
                    error: "No puedes desactivar al único administrador activo del sistema"
                })
            }
        }

        const resultado = await pool.query(
            `UPDATE usuarios
             SET estado = CASE WHEN estado = 'activo' THEN 'inactivo' ELSE 'activo' END
             WHERE id_usuario = $1
             RETURNING id_usuario, nombre, apellido, email, rol, estado`,
            [id]
        )

        res.json({
            mensaje: "Estado actualizado correctamente",
            usuario: resultado.rows[0],
        })

    } catch (error) {
        console.error("Error en cambiarEstadoUsuario:", error)
        res.status(500).json({ error: "Error al cambiar el estado del usuario" })
    }
}

export async function cambiarRolUsuario(req, res) {
    try {
        const { id } = req.params
        const { rol } = req.body

        if (!rol) {
            return res.status(400).json({ error: "El rol es obligatorio" })
        }

        // Si le van a quitar el rol admin a alguien, primero verificamos
        // que no sea el último admin del sistema.
        if (rol !== "admin") {
            const usuarioActual = await pool.query(
                `SELECT rol FROM usuarios WHERE id_usuario = $1`,
                [id]
            )

            if (usuarioActual.rows.length === 0) {
                return res.status(404).json({ error: "Usuario no encontrado" })
            }

            if (usuarioActual.rows[0].rol === "admin") {
                const conteoAdmins = await pool.query(
                    `SELECT COUNT(*)::int AS total FROM usuarios WHERE rol = 'admin' AND estado != 'eliminado'`
                )

                if (conteoAdmins.rows[0].total <= 1) {
                    return res.status(400).json({
                        error: "No puedes quitarle el rol de admin al único administrador del sistema"
                    })
                }
            }
        }

        const resultado = await pool.query(
            `UPDATE usuarios
             SET rol = $1
             WHERE id_usuario = $2
             RETURNING id_usuario, nombre, apellido, email, rol, estado`,
            [rol, id]
        )

        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" })
        }

        res.json({
            mensaje: "Rol actualizado correctamente",
            usuario: resultado.rows[0],
        })

    } catch (error) {
        // 23514 = violación de CHECK constraint (ej: si "rol" tiene valores permitidos en la BD)
        if (error.code === "23514") {
            return res.status(400).json({ error: "Ese rol no es válido" })
        }
        res.status(500).json({ error: "Error al cambiar el rol del usuario" })
    }
}

export async function eliminarUsuario(req, res) {
    try {
        const { id } = req.params

        // No dejamos que un admin se borre a sí mismo por accidente mientras tiene la sesión activa.
        if (req.usuario?.id && String(req.usuario.id) === String(id)) {
            return res.status(400).json({ error: "No puedes eliminar tu propia cuenta mientras tienes sesión activa" })
        }

        const usuarioActual = await pool.query(
            `SELECT rol, estado FROM usuarios WHERE id_usuario = $1`,
            [id]
        )

        if (usuarioActual.rows.length === 0 || usuarioActual.rows[0].estado === "eliminado") {
            return res.status(404).json({ error: "Usuario no encontrado" })
        }

        if (usuarioActual.rows[0].rol === "admin") {
            const conteoAdmins = await pool.query(
                `SELECT COUNT(*)::int AS total FROM usuarios WHERE rol = 'admin' AND estado != 'eliminado'`
            )

            if (conteoAdmins.rows[0].total <= 1) {
                return res.status(400).json({
                    error: "No puedes eliminar al único administrador del sistema"
                })
            }
        }

        // Soft delete: marcamos el estado en vez de borrar la fila, así conservamos
        // el historial y cualquier referencia de otras tablas sigue siendo válida.
        const resultado = await pool.query(
            `UPDATE usuarios
             SET estado = 'eliminado'
             WHERE id_usuario = $1
             RETURNING id_usuario, nombre, apellido, email, rol, estado`,
            [id]
        )

        res.json({
            mensaje: "Usuario eliminado correctamente",
            usuario: resultado.rows[0],
        })

    } catch (error) {
        console.error("Error en eliminarUsuario:", error)
        res.status(500).json({ error: "Error al eliminar el usuario" })
    }
}

export async function importarUsuarios(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No se recibió ningún archivo" })
        }

        // Convertimos el archivo (que llega como buffer en memoria) a un array de objetos JS.
        // Cada fila del Excel se vuelve un objeto usando la primera fila como nombres de columna.
        const libro = XLSX.read(req.file.buffer, { type: "buffer" })
        const primeraHoja = libro.Sheets[libro.SheetNames[0]]
        const filas = XLSX.utils.sheet_to_json(primeraHoja)

        if (filas.length === 0) {
            return res.status(400).json({ error: "El archivo está vacío" })
        }

        const creados = []
        const errores = []

        for (let i = 0; i < filas.length; i++) {
            const fila = filas[i]
            const numeroFila = i + 2 // +2 porque la fila 1 del Excel son los encabezados

            const nombre = fila.nombre?.toString().trim()
            const apellido = fila.apellido?.toString().trim()
            const email = fila.email?.toString().trim()
            const contraseña = fila.contraseña?.toString().trim()
            const rol = fila.rol?.toString().trim()

            if (!nombre || !apellido || !email || !contraseña || !rol) {
                errores.push({ fila: numeroFila, motivo: "Faltan campos obligatorios (nombre, apellido, email, contraseña, rol)" })
                continue
            }

            try {
                const contraseñaHash = await bcrypt.hash(contraseña, 10)

                const resultado = await pool.query(
                    `INSERT INTO usuarios (nombre, apellido, email, contraseña, rol, estado)
                     VALUES ($1, $2, $3, $4, $5, 'activo')
                     RETURNING id_usuario, nombre, apellido, email, rol`,
                    [nombre, apellido, email, contraseñaHash, rol]
                )

                creados.push(resultado.rows[0])

            } catch (error) {
                if (error.code === "23505") {
                    errores.push({ fila: numeroFila, motivo: `El correo ${email} ya está registrado` })
                } else if (error.code === "23514") {
                    errores.push({ fila: numeroFila, motivo: `El rol "${rol}" no es válido` })
                } else {
                    errores.push({ fila: numeroFila, motivo: "Error al guardar esta fila" })
                }
            }
        }

        res.json({
            mensaje: `Importación terminada: ${creados.length} de ${filas.length} usuarios creados`,
            total_filas: filas.length,
            creados,
            errores,
        })

    } catch (error) {
        console.error("Error en importarUsuarios:", error)
        res.status(500).json({ error: "Error al procesar el archivo Excel" })
    }
}

export async function crearUsuario(req, res) {
    try {
        const { nombre, apellido, email, contraseña, rol } = req.body

        if (!nombre || !apellido || !email || !contraseña || !rol) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" })
        }

        // Igual que en el registro de clientes: un correo no puede quedar en las dos tablas.
        const yaExisteComoCliente = await pool.query(
            "SELECT email FROM clientes WHERE email = $1",
            [email]
        )

        if (yaExisteComoCliente.rows.length > 0) {
            return res.status(400).json({ error: "Ese correo ya está registrado como cliente" })
        }

        const contraseñaHash = await bcrypt.hash(contraseña, 10)

        const resultado = await pool.query(
            `INSERT INTO usuarios (nombre, apellido, email, contraseña, rol, estado)
             VALUES ($1, $2, $3, $4, $5, 'activo')
             RETURNING id_usuario, nombre, apellido, email, rol, estado`,
            [nombre, apellido, email, contraseñaHash, rol]
        )

        res.status(201).json({
            mensaje: "Usuario creado correctamente",
            usuario: resultado.rows[0],
        })

    } catch (error) {
        if (error.code === "23505") {
            return res.status(400).json({ error: "Ese correo ya está registrado" })
        }
        if (error.code === "23514") {
            return res.status(400).json({ error: "El rol no es válido" })
        }
        res.status(500).json({ error: "Error al crear el usuario" })
    }
}