import requests
import json

url = "http://localhost:3000/api/templates"
data = {
    "name": "NurText",
    "code": '<section class="page">\n  <header>\n    <h2>{{title}}</h2>\n  </header>\n  {{text}}\n  <footer>Footer</footer>\n</section>',
    "type": "BLOCK"
}

response = requests.post(url, json=data, headers={"Content-Type": "application/json"})
print(f"Status: {response.status_code}")
print(f"Response: {response.text}")
