import React from 'react';
import SeatSelector from '../components/SeatSelector';

const Home = () => {
    return (
        <div className="home">
            <h1>Welcome to the Cinema Seat Reservation</h1>
            <h2>Select Your Seats</h2>
            <SeatSelector />
        </div>
    );
};

export default Home;