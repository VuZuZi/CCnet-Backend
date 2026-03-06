import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';


export const optionalAuthenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.jwt.accessSecret);
      
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        fullName: decoded.fullName
      };
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
    }
  }
  
  next();
};