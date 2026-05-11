NBA Live Win Probability Predictor

A real-time NBA analytics web application that predicts live win probabilities during NBA games using a linear regression model trained on 10 seasons of historical NBA data.

The backend is built with Python and FastAPI, using the NBA API to fetch and process live game data in real time. The frontend is built with React and JavaScript, providing a live-updating dashboard displaying current scores, game information, and dynamically calculated win probabilities throughout each game.

Features
Live NBA game tracking
Real-time win probability updates
Linear regression prediction model
Historical training data from 10 NBA seasons
FastAPI backend API
React frontend dashboard
Live data integration using NBA API
Tech Stack
Backend
Python
FastAPI
scikit-learn
pandas
NBA API
Frontend
React
JavaScript
Axios
How It Works

The application continuously fetches live NBA game data through the NBA API, processes the current game state, and feeds variables such as score differential, game clock, and possession context into a trained linear regression model to estimate each team's probability of winning in real time.
