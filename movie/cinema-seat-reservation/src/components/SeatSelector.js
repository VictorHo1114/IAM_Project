import React, { useState } from 'react';

const SeatSelector = () => {
    const [selectedSeats, setSelectedSeats] = useState([]);

    const seats = Array.from({ length: 30 }, (_, index) => index + 1); // Create an array of 30 seats

    const toggleSeatSelection = (seat) => {
        setSelectedSeats((prevSelected) => 
            prevSelected.includes(seat) 
                ? prevSelected.filter((s) => s !== seat) 
                : [...prevSelected, seat]
        );
    };

    return (
        <div className="seat-selector">
            <h2>Select Your Seats</h2>
            <div className="seats">
                {seats.map((seat) => (
                    <div 
                        key={seat} 
                        className={`seat ${selectedSeats.includes(seat) ? 'selected' : ''}`} 
                        onClick={() => toggleSeatSelection(seat)}
                    >
                        {seat}
                    </div>
                ))}
            </div>
            <div className="selected-seats">
                <h3>Selected Seats: {selectedSeats.join(', ')}</h3>
            </div>
        </div>
    );
};

export default SeatSelector;