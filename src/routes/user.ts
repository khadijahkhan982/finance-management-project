import express from "express"

import { signup, user_auth ,delete_user, user_logout, get_user, forgot_password, verify_otp, reset_password,
     resend_token,
     update_user, user_login} from "../controllers/userController"
import { protect } from "../middleware/authMiddleware"; // Must be imported

const router = express.Router()
router.post('/signup', signup, (req, res) => {
  
    const user = res.locals.user;
    return res.status(201).send({
        message: "User created. Verification token sent.",
        user: { id: user.id, email: user.email },
    });
});
router.post('/verify-user', user_auth)
router.post('/resend-token', resend_token)
router.post('/logout/:userId', protect, user_logout)
router.get('/user/:userId', protect, get_user)
router.put('/user/:userId', protect, update_user)
router.delete('/user/:userId', protect, delete_user)
router.post('/login', user_login)

router.post('/forgot-password', forgot_password)
router.post('/verify-otp', verify_otp)
router.post('/reset-password', reset_password)

export default router;