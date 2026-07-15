import React from 'react'
import SocialAnimalsRPG from './SocialAnimalIcons'
import { SpriteGallery } from './Critters.jsx'

export default function App() {
  // Dev view: /?gallery=1 renders every species in idle/walk/fight/friendly.
  const gallery = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('gallery')
  return (
    <div className="w-screen h-screen">
      {gallery ? <SpriteGallery /> : <SocialAnimalsRPG />}
    </div>
  )
}
