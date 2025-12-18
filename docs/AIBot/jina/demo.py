import requests

url = "https://s.jina.ai/?q=digital+humanities+AI&hl=en"
headers = {
    "Accept": "application/json",
    "Authorization": "Bearer jina_ff6481d9c9f642cda37fa026cde7fb3822MvUBZckWmr8N19lMOjswVKiGqR",
    "X-Engine": "direct"
}

response = requests.get(url, headers=headers)

print(response.json())
