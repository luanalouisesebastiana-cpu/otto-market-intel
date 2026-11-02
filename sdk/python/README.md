# otto-sdk (Python)

```bash
pip install otto-sdk   # or: pip install .
```

```python
from otto_sdk import OttoClient, PaymentRequired
c = OttoClient()
print(c.summary())                      # free
try:
    print(c.intel())                    # paid -> raises PaymentRequired with challenge
except PaymentRequired as e:
    print(e.challenge["accepts"])       # x402 instructions to pay
```
