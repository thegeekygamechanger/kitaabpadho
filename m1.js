// main.js

// Fetching the form and suggestions container from the DOM
const queryForm = document.getElementById('query-form');
const suggestionsContainer = document.getElementById('suggestions-container');

// Function to post a new query
async function postQuery(event) {
    event.preventDefault();

    // Fetching the form data
    const location = document.getElementById('location').value;
    const query = document.getElementById('query').value;

    // Sending a POST request to the server
    const response = await fetch('/api/postQuery', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ location, query })
    });

    // If the request was successful, clear the form
    if (response.ok) {
        queryForm.reset();
        getSuggestions(location);
    }
}

// Function to get relevant suggestions
async function getSuggestions(location) {
    // Sending a GET request to the server
    const response = await fetch(`/api/getSuggestions?location=${location}`);
    const suggestions = await response.json();

    // Clearing the suggestions container
    suggestionsContainer.innerHTML = '';

    // Adding each suggestion to the suggestions container
    suggestions.forEach(suggestion => {
        const suggestionElement = document.createElement('p');
        suggestionElement.textContent = suggestion;
        suggestionsContainer.appendChild(suggestionElement);
    });
}

// Adding an event listener to the form
queryForm.addEventListener('submit', postQuery);
