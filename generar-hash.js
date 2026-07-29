import bcrypt from 'bcrypt';



const contraseña = "admin123";
const hash = bcrypt.hashSync(contraseña, 10);
console.log("Hash generado:", hash);