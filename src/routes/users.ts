import app from "../app.js";
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

interface UserRequestBody {
    name: string;
    email: string;
    password: string;
}

app.post('/users', async (req, res) => {
    const { name, email, password } = req.body as UserRequestBody;

    if (!name || !email || !password) {
        return res.status(400).json("invalid request");
    }

    const userData = await db.select().from(users).where(eq(users.email, email));

    if (userData.length > 0) {
        return res.status(409).json("email already exist");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        await db.transaction(async (tx) => {
            const userData = await tx.select().from(users).where(eq(users.email, email));
    
            if (userData.length > 0) {
                return res.status(409).json("email already exist");
            }
    
            await tx.insert(users).values({ name: name, email: email, password: hashedPassword });
        })
    
        console.log("201: User registered successfully!");
        return res.status(201).json({
            message: "User registered successfully!",
            user: {
                name: name,
                email: email
            }
        })
    } catch (error) {
        console.log("400: error in creating user");
        return res.status(400).json({
            message: error,
        })
    }
})