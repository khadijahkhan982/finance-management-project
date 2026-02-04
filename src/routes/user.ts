import express from "express"

import { signup ,delete_user, user_logout, get_user, forgot_password, verify_otp,verifySignup, reset_password,
     resend_token,
     update_user, user_login} from "../controllers/userController"
import { protect } from "../middleware/authMiddleware"; // Must be imported
import { signupSchema } from "../validations/userValidation";
import { validate, validateOwnership } from "../middleware/validation";

const router = express.Router()
router.post('/signup', validate(signupSchema), signup);
router.post('/resend-token', resend_token)
router.post('/logout/:userId', protect, validateOwnership, user_logout)
router.get('/user/:userId', protect, validateOwnership, get_user)
router.put('/user/:userId', protect,validateOwnership, update_user)
router.delete('/user/:userId', protect, validateOwnership, delete_user)
router.post('/login', user_login)

router.post('/forgot-password', forgot_password)
router.post('/verify-otp', verify_otp)
router.post('/reset-password', reset_password)
router.post('/verify-signup', verifySignup)

export default router;