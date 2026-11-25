import React, { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Login from './Pages/Login'
import { me } from './features/auth'
import { useDispatch, useSelector } from 'react-redux'
import { setUserData } from './redux/userSlice'
import Home from './Pages/Home'
import Agents from './Pages/Agents'
import Integration from './Pages/Integration'
import CreateAgent from './Pages/CreateAgent'
import Pricing from './Pages/Pricing'

function App() {
  const dispatch = useDispatch()
  useEffect(()=>{
    const fetch=async ()=>{
      try {
        const data=await me()
        dispatch(setUserData(data))
      } catch (error) {
        console.log(error)
      }
    }

    fetch()
  },[])

  const {userData}=useSelector(state=>state.user)
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path='/login' element={userData?<Navigate to={"/"}/>:<Login/>}/>
          <Route path='/' element={userData?<Home/>:<Navigate to={"/login"}/>}/>
          <Route path='/agents' element={userData?<Agents/>:<Navigate to={"/login"}/>}/>
          <Route path='/integration' element={userData?<Integration/>:<Navigate to={"/login"}/>}/>
          <Route path='/pricing' element={userData?<Pricing/>:<Navigate to={"/login"}/>}/>
          <Route path='/agents/new' element={userData?<CreateAgent/>:<Navigate to={"/login"}/>}/>
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App
