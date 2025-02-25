# Python API server

Deployment workflow:

1. Install python

```sh
sudo apt install python3 python3.12-venv
```

2. Clone Repo

````sh
git clone https://github.com/kenlau666/tg-bulk-invite-next.git
```

3. Setup venv

```sh
cd tg-bulk-invite-next/api
python3 -m venv venv
source venv/bin/activate
````

4. Install deps

```sh
pip install -r requirements.txt
```

5. Run

```sh
gunicorn --bind 0.0.0.0:5328 wsgi:app
```

or run in background

```sh
gunicorn --bind 0.0.0.0:5328 wsgi:app &
```
