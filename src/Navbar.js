import React from 'react'
import { Link } from 'react-router-dom'
export const Navbar = () => {
    return (
        <>
            <nav class="navbar navbar-expand-lg navbar-light bg-light">
                <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>

                <div class="collapse navbar-collapse" id="navbarSupportedContent">
                    <ul class="navbar-nav mr-auto">
                        {/* <li class="nav-item">
                            <Link class="nav-link" to="/">Home</Link>
                        </li> */}
                        <li class="nav-item">
                            <Link class="nav-link" to="/qrcode">QrCode</Link>
                        </li>
                        <li class="nav-item">
                            <Link class="nav-link" to="/diamond">Diamond</Link>
                        </li>


                    </ul>
                </div>
            </nav>
        </>
    )
}
