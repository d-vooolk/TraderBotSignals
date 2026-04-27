import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('217.12.37.199', username='root', password='82Ehedub!', timeout=15)

hosts = [
    'fstream.binance.com',
    'fstream1.binance.com',
    'fstream2.binance.com',
    'fstream3.binance.com',
]

for host in hosts:
    print(f"\n=== Testing wss://{host}/ws/btcusdt@kline_1m ===")
    _, o, _ = c.exec_command(
        f'cd /var/www/TraderBotSignals && timeout 6 node -e "'
        f'const WebSocket = require(\\"ws\\"); '
        f'const ws = new WebSocket(\\"wss://{host}/ws/btcusdt@kline_1m\\"); '
        f'ws.on(\\"open\\", () => console.log(\\"OPEN\\")); '
        f'ws.on(\\"message\\", (d) => {{ console.log(\\"DATA OK\\"); process.exit(0); }}); '
        f'ws.on(\\"close\\", (code) => console.log(\\"CLOSE:\\" + code)); '
        f'ws.on(\\"error\\", (e) => console.log(\\"ERROR:\\" + e.message)); '
        f'setTimeout(() => {{ console.log(\\"TIMEOUT\\"); process.exit(1); }}, 5000);" 2>&1'
    )
    print(o.read().decode('utf-8', errors='replace'))

c.close()
