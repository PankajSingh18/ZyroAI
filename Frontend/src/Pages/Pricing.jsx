import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Coins, Crown, Users, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { createOrder, verify } from '@/features/payment'
import { setUserData } from '@/redux/userSlice'

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Try ZyroAI and explore the possibilities.',
    price: 'Free',
    credits: 100,
    icon: Zap,
    features: [
      '100 free credits',
      'Basic AI chat',
      'Explore AI agents',
      'Standard access',
    ],
    buttonText: 'Current Plan',
    disabled: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For developers who want to do more with AI.',
    price: 299,
    credits: 500,
    icon: Crown,
    features: [
      '500 credits',
      'Advanced AI conversations',
      'Access to AI tools',
      'Automate everyday tasks',
      'One-time payment',
    ],
    buttonText: 'Get Pro',
    popular: true,
    disabled: false,
  },
  {
    id: 'team',
    name: 'Team',
    description: 'More credits for demanding AI workflows.',
    price: 799,
    credits: 2000,
    icon: Users,
    features: [
      '2,000 credits',
      'Advanced AI conversations',
      'Access to AI tools',
      'Run complex workflows',
      'One-time payment',
    ],
    buttonText: 'Get Team',
    disabled: false,
  },
]

function Pricing() {
  const [purchaseNotice, setPurchaseNotice] = useState(null)
  const [loadingPlan, setLoadingPlan] = useState('')
  const dispatch = useDispatch()
  const userData = useSelector((state) => state.user.userData)

  const handlePurchase = async (planId) => {
    if (planId === 'starter' || loadingPlan) return

    setLoadingPlan(planId)
    setPurchaseNotice(null)

    try {
      if (typeof window.Razorpay !== 'function') {
        throw new Error('Razorpay Checkout did not load. Please refresh and try again.')
      }

      const orderData = await createOrder(planId)
      const { order, plan, key_id: keyId } = orderData || {}
      if (!order?.id || !order.amount || !order.currency || !keyId || !plan?.name) {
        throw new Error('Invalid order response from the server.')
      }

      let paymentHandled = false
      const checkout = new window.Razorpay({
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'ZyroAI',
        description: `${plan.name} Plan - ${plan.credits} Credits`,
        order_id: order.id,
        theme: { color: '#a78bfa' },
        handler: async (paymentResponse) => {
          paymentHandled = true
          try {
            const result = await verify(paymentResponse)
            if (Number.isFinite(result.remainingCredits)) {
              dispatch(setUserData({ ...userData, credits: result.remainingCredits }))
            }
            setPurchaseNotice({
              type: 'success',
              message: `Payment verified. ${result.creditsAdded} credits added to your account.`,
            })
          } catch (error) {
            setPurchaseNotice({
              type: 'error',
              message:
                error?.response?.data?.message ||
                error?.message ||
                'Payment verification failed. Please contact support.',
            })
          } finally {
            setLoadingPlan('')
          }
        },
        modal: {
          ondismiss: () => {
            setLoadingPlan('')
            if (!paymentHandled) {
              setPurchaseNotice({
                type: 'error',
                message: 'Checkout closed before payment was completed.',
              })
            }
          },
        },
      })

      checkout.on('payment.failed', (failure) => {
        paymentHandled = true
        setPurchaseNotice({
          type: 'error',
          message:
            failure?.error?.description ||
            'Payment failed. Please try again.',
        })
        setLoadingPlan('')
      })
      checkout.open()
    } catch (error) {
      setPurchaseNotice({
        type: 'error',
        message:
          error?.response?.data?.message ||
          error?.message ||
          'Unable to start checkout. Please try again.',
      })
      setLoadingPlan('')
    }
  }

  return (
    <div className='relative min-h-screen overflow-x-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#2b2f3a_0%,#191b21_55%,#121317_100%)] text-white'>
      <div aria-hidden='true' className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]' />

      <header className='relative z-10 flex h-16 items-center justify-between px-4 sm:h-[4.5rem] sm:px-6'>
        <Link to='/' className='flex items-center gap-3'>
          <span className='grid size-10 place-items-center rounded-xl border border-violet-300/20 bg-[#211a35] text-violet-100 shadow-lg shadow-violet-950/30'>
            <BrandMark size={23} />
          </span>
          <span className='text-3xl font-bold tracking-[-0.06em] text-white'>
            Zyro<span className='text-violet-300'>AI</span>
          </span>
        </Link>
        <Link to='/' className='inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-white'>
          <ArrowLeft size={16} />
          Back to home
        </Link>
      </header>

      <main className='relative z-10 mx-auto w-full max-w-6xl px-4 py-3 sm:px-6 lg:flex lg:h-[calc(100vh-4.5rem)] lg:flex-col lg:overflow-hidden lg:py-3'>
        <div className='mx-auto mb-3 max-w-2xl shrink-0 text-center'>
          <span className='inline-flex rounded-full border border-violet-300/20 bg-violet-400/[0.08] px-3 py-1 text-xs font-medium text-violet-200'>
            Plans & credits
          </span>
          <h1 className='mt-2 text-3xl font-semibold tracking-tight sm:text-4xl'>
            Choose your plan
          </h1>
          <p className='mt-3 text-sm leading-6 text-zinc-400 sm:text-base'>
            One-time credit packs for AI conversations, tools, and workflows.
          </p>
        </div>

        {purchaseNotice && (
          <p
            role='status'
            className={`mx-auto mb-4 max-w-2xl rounded-xl border px-4 py-2 text-center text-sm ${
              purchaseNotice.type === 'success'
                ? 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100'
                : 'border-amber-300/20 bg-amber-300/[0.08] text-amber-100'
            }`}
          >
            {purchaseNotice.message}
          </p>
        )}

        <section aria-label='Pricing plans' className='grid items-stretch gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-3'>
          {plans.map((plan) => {
            const PlanIcon = plan.icon
            return (
              <article
                key={plan.id}
                className={`relative flex flex-col rounded-3xl border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5 lg:h-full lg:min-h-0 lg:p-5 ${
                  plan.popular
                    ? 'border-violet-300/35 bg-[#202127] shadow-[0_20px_60px_rgba(124,58,237,0.12)]'
                    : 'border-white/10 bg-white/[0.035]'
                }`}
              >
                {plan.popular && (
                  <span className='absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-zinc-900 shadow-lg'>
                    Most Popular
                  </span>
                )}
                <span className='mb-2 grid size-9 place-items-center rounded-xl border border-violet-300/15 bg-violet-400/[0.08] text-violet-200'>
                  <PlanIcon size={20} />
                </span>
                <h2 className='text-lg font-semibold'>{plan.name}</h2>
                <p className='mt-1 min-h-8 max-w-xs text-sm leading-5 text-zinc-400'>{plan.description}</p>

                <div className='mt-3 flex items-baseline gap-2'>
                  <span className='text-[2.1rem] font-semibold tracking-tight'>
                    {typeof plan.price === 'number' ? `₹${plan.price.toLocaleString('en-IN')}` : plan.price}
                  </span>
                  {typeof plan.price === 'number' && <span className='text-sm text-zinc-500'>/ once</span>}
                </div>

                <div className='mt-2.5 flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-black/20 px-3.5 py-2 text-sm font-medium text-zinc-200'>
                  <Coins size={16} className='text-violet-300' />
                  {plan.credits.toLocaleString('en-IN')} credits
                </div>

                <div className='my-3 border-t border-white/10 pt-3'>
                  <h3 className='text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500'>
                    What&apos;s included
                  </h3>
                  <ul className='mt-2 flex-1 space-y-1.5'>
                    {plan.features.map((feature) => (
                      <li key={feature} className='flex items-start gap-2.5 text-sm text-zinc-300'>
                        <Check size={16} className='mt-0.5 shrink-0 text-violet-300' />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className='mt-auto pt-2'>
                  <Button
                    type='button'
                    disabled={plan.disabled || Boolean(loadingPlan)}
                    onClick={() => handlePurchase(plan.id)}
                    className={`h-10 w-full rounded-xl ${
                      plan.disabled
                        ? 'border border-white/10 bg-white/[0.06] text-zinc-400'
                        : plan.popular
                          ? 'bg-white text-zinc-900 hover:bg-zinc-200'
                          : 'border border-white/10 bg-white/[0.06] text-zinc-200 hover:bg-white/[0.1]'
                    }`}
                  >
                    {loadingPlan === plan.id ? 'Processing...' : plan.buttonText}
                    {!plan.disabled && loadingPlan !== plan.id && <ArrowRight size={15} className='ml-1.5' />}
                  </Button>
                </div>
              </article>
            )
          })}
        </section>

        <p className='mx-auto mt-3 max-w-2xl shrink-0 text-center text-xs leading-5 text-zinc-500'>
          Credits are added to your account after payment verification.
        </p>
      </main>
    </div>
  )
}

export default Pricing