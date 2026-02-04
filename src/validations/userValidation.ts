import { z} from 'zod';

export const signupSchema = z.object({
  body: z.object({
    full_name: z.string().min(2, "Name is too short"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    phone_number: z.string().min(10, "Invalid phone number"),
    date_of_birth: z.string().refine((date) => !isNaN(Date.parse(date)), {
      message: "Invalid date format",
    }),
    city: z.string().min(1, "City is required"),
    country: z.string().min(1, "Country is required"),
    street: z.string().min(1, "Street is required"),
    house_number: z.string().min(1, "House number is required"),
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    email: z.string().email(),
    otp: z.string().length(6, "OTP must be exactly 6 digits"),
  }),
});