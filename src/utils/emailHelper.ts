import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com", 
  port: 587,
  secure: false, 
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS, 
  },
});

export const sendOTPEmail = async (email: string, otp: string) => {
  const mailOptions = {
    from: '"Finance Management Project" <no-reply@yourapp.com>',
    to: email,
    subject: "Your Verification Code",
    text: `Your OTP is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your OTP is ${otp}</p><p>It expires in 10 minutes.</p>`,
  };

  return await transporter.sendMail(mailOptions);
};

export const sendOTPForPasswordReset = async (email: string, otp: string) => {
  const mailOptions = {
    from: '"Finance Management Project" <no-reply@yourapp.com>',
    to: email,
    subject: "Your Verification Code",
    text: `Your OTP is ${otp}. Please use this to reset your password. It expires in 10 minutes.`,
    html: `<p>Your OTP is ${otp}</p><p>Please use this to reset your password. It expires in 10 minutes.</p>`,
  };

  return await transporter.sendMail(mailOptions);
};