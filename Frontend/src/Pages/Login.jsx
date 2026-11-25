import React from 'react'
import { BrandMark } from '@/components/brand-mark'
import { LoginForm } from '../components/login-form'

function Login() {
  return (
    <div className='relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#2b2f3a_0%,#191b21_55%,#121317_100%)] px-4 py-8 text-white'>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]"
      />

      <div className='relative z-10 flex w-full max-w-md flex-col items-center'>
        {/* Top Logo and App Name */}
        <div className='mb-8 flex flex-col items-center text-center'>
          <div className='flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-300/20 bg-[#211a35] text-violet-100 shadow-lg shadow-violet-950/30'>
            <BrandMark size={31} />
          </div>
          <p className='mt-3 text-4xl font-bold tracking-[-0.06em] text-white'>
            Zyro<span className='text-violet-300'>AI</span>
          </p>
        </div>

        {/* Card Container */}
        <div className='w-full rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl sm:p-10'>
          <LoginForm />
        </div>
      </div>
    </div>
  )
}

export default Login
