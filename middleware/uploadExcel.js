import multer from "multer"

// Guardamos el archivo en memoria (req.file.buffer), no en disco —
// como solo lo leemos una vez para parsearlo, no necesitamos persistirlo.
const almacenamiento = multer.memoryStorage()

function filtrarArchivo(req, file, cb) {
    const tiposPermitidos = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
        "application/vnd.ms-excel", // .xls
    ]

    if (tiposPermitidos.includes(file.mimetype)) {
        cb(null, true)
    } else {
        cb(new Error("Solo se permiten archivos Excel (.xlsx o .xls)"))
    }
}

export const uploadExcel = multer({
    storage: almacenamiento,
    fileFilter: filtrarArchivo,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB máximo
})