# ShillOps Contracts

Solidity smart contracts for the ShillOps on-chain redemption system.

## Contracts

### `ShillOpsRedeemer.sol`

Allows ShillOps point holders to redeem ERC-20 tokens using a server-generated ECDSA signature.

**How it works:**
1. User burns points on ShillOps → API generates a signed claim `(claimer, token, amount, nonce)`
2. User calls `claim(amount, nonce, signature)` on this contract
3. Contract verifies the ECDSA signature matches the ShillOps signer key
4. Tokens are transferred to the claimer; nonce is marked used (replay protection)

## Setup (Foundry)

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts

# Build
forge build

# Test
forge test -v
```

## Deployment

```bash
# Set env vars
export PRIVATE_KEY=0x...          # deployer key
export SIGNER_ADDRESS=0x...       # address derived from CLAIM_SIGNER_KEY in the API
export TOKEN_ADDRESS=0x...        # ERC-20 token to distribute

# Deploy (replace RPC_URL with your chain)
forge create src/ShillOpsRedeemer.sol:ShillOpsRedeemer \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --constructor-args $SIGNER_ADDRESS $TOKEN_ADDRESS
```

After deploying:
1. Transfer reward tokens to the contract address
2. Set `contractAddress` in your ShillOps community to this contract address

## Environment Variables (API)

| Variable | Description |
|----------|-------------|
| `CLAIM_SIGNER_KEY` | Ethereum private key — derive `SIGNER_ADDRESS` from this with `cast wallet address $CLAIM_SIGNER_KEY` |
