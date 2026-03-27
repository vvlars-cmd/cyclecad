#!/usr/bin/env python3
"""
cycleCAD API Client Example

Simple Python client for the cycleCAD REST API.
Demonstrates how to create a simple part using the API.

Usage:
    python3 api-client-example.py
    python3 api-client-example.py --host 0.0.0.0 --port 3000 --api-key YOUR_KEY

Requirements:
    pip install requests
"""

import requests
import json
import argparse
from typing import Dict, Any, List, Optional


class CycleCADClient:
    """Python client for cycleCAD API Server"""

    def __init__(self, host: str = 'localhost', port: int = 3000, api_key: Optional[str] = None):
        """
        Initialize the client.

        Args:
            host: Server hostname (default: localhost)
            port: Server port (default: 3000)
            api_key: Optional API key for authentication
        """
        self.base_url = f'http://{host}:{port}'
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
        })
        if api_key:
            self.session.headers.update({'X-API-Key': api_key})

    def _request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Dict[str, Any]:
        """Make HTTP request to API."""
        url = f'{self.base_url}{endpoint}'

        if method == 'GET':
            response = self.session.get(url)
        elif method == 'POST':
            response = self.session.post(url, json=data)
        elif method == 'DELETE':
            response = self.session.delete(url)
        else:
            raise ValueError(f'Unsupported method: {method}')

        if response.status_code >= 400:
            try:
                error = response.json()
                raise Exception(f'API Error ({response.status_code}): {error.get("error", response.text)}')
            except:
                raise Exception(f'API Error ({response.status_code}): {response.text}')

        return response.json()

    def execute(self, method: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        """Execute a single API command."""
        return self._request('POST', '/api/execute', {
            'method': method,
            'params': params or {}
        })

    def batch(self, commands: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Execute multiple commands in a batch."""
        return self._request('POST', '/api/batch', {
            'commands': commands
        })

    def get_schema(self) -> Dict[str, Any]:
        """Get API schema."""
        return self._request('GET', '/api/schema')

    def get_health(self) -> Dict[str, Any]:
        """Check server health."""
        return self._request('GET', '/api/health')

    def get_history(self, count: int = 20) -> Dict[str, Any]:
        """Get command history."""
        return self._request('GET', f'/api/history?count={count}')

    def get_models(self) -> Dict[str, Any]:
        """List all models."""
        return self._request('GET', '/api/models')

    def get_model(self, model_id: str) -> Dict[str, Any]:
        """Get specific model."""
        return self._request('GET', f'/api/models/{model_id}')

    def delete_model(self, model_id: str) -> Dict[str, Any]:
        """Delete a model."""
        return self._request('DELETE', f'/api/models/{model_id}')


def example_simple_part(client: CycleCADClient):
    """Example: Create a simple cylindrical part."""
    print("\n" + "="*60)
    print("EXAMPLE 1: Simple Cylindrical Part")
    print("="*60 + "\n")

    # Start sketch
    print("1. Starting sketch on XY plane...")
    r = client.execute('sketch.start', {'plane': 'XY'})
    print(f"   ✓ {r['result']['message']}")

    # Draw circle
    print("2. Drawing circle (radius 25mm)...")
    r = client.execute('sketch.circle', {
        'cx': 0,
        'cy': 0,
        'radius': 25
    })
    print(f"   ✓ Circle created: {r['result']['entityId']}")
    print(f"     Area: {r['result']['area']:.2f} mm²")

    # End sketch and extrude
    print("3. Ending sketch...")
    r = client.execute('sketch.end', {})
    print(f"   ✓ {r['result']['message']}")

    print("4. Extruding to 50mm height...")
    r = client.execute('ops.extrude', {
        'height': 50,
        'symmetric': False,
        'material': 'steel'
    })
    print(f"   ✓ Extrusion created: {r['result']['featureId']}")
    print(f"     Volume: {r['result']['volume']} mm³")
    print(f"     Material: {r['result']['material']}")

    return r['result']['featureId']


def example_batch_operations(client: CycleCADClient):
    """Example: Create a rectangular part using batch commands."""
    print("\n" + "="*60)
    print("EXAMPLE 2: Batch Operations - Rectangular Part")
    print("="*60 + "\n")

    commands = [
        {
            'method': 'sketch.start',
            'params': {'plane': 'XY'}
        },
        {
            'method': 'sketch.rect',
            'params': {'x': 0, 'y': 0, 'width': 60, 'height': 40}
        },
        {
            'method': 'sketch.end',
            'params': {}
        },
        {
            'method': 'ops.extrude',
            'params': {'height': 30, 'material': 'aluminum'}
        }
    ]

    print("Executing batch of 4 commands...")
    r = client.batch(commands)

    if r['ok']:
        print(f"✓ All {r['executed']} commands succeeded in {r['elapsed']}ms")
        for i, result in enumerate(r['results']):
            cmd = commands[i]['method']
            print(f"  [{i+1}] {cmd}: {result.get('elapsed', 0)}ms")
    else:
        print(f"✗ Batch failed with {len(r['errors'])} errors")
        for error in r['errors']:
            print(f"  [{error['index']}] {error['method']}: {error['error']}")


def example_query_and_validation(client: CycleCADClient):
    """Example: Query model data and validate."""
    print("\n" + "="*60)
    print("EXAMPLE 3: Query and Validation")
    print("="*60 + "\n")

    # Get available materials
    print("1. Available materials:")
    r = client.execute('query.materials', {})
    for mat in r['result']['materials']:
        print(f"   • {mat}")

    # Get feature list
    print("\n2. Current features:")
    r = client.execute('query.features', {})
    print(f"   Total: {r['result']['count']} features")

    # Validate mass
    print("\n3. Calculating mass for steel part (extrude_...):")
    r = client.execute('validate.mass', {
        'target': 'extrude_1234567890000',
        'material': 'steel'
    })
    print(f"   Mass: {r['result']['mass']} kg")

    # Estimate cost
    print("\n4. Estimating manufacturing cost (FDM):")
    r = client.execute('validate.cost', {
        'target': 'extrude_1234567890000',
        'process': 'FDM',
        'material': 'PLA'
    })
    print(f"   Estimated cost: ${r['result']['estimatedCost']} USD")


def example_view_operations(client: CycleCADClient):
    """Example: View control commands."""
    print("\n" + "="*60)
    print("EXAMPLE 4: View Operations")
    print("="*60 + "\n")

    views = ['isometric', 'top', 'front', 'right']

    for view in views:
        print(f"Setting view to: {view}")
        r = client.execute('view.set', {'view': view})
        print(f"  ✓ {r['result']['message']}\n")


def example_export(client: CycleCADClient):
    """Example: Export operations."""
    print("\n" + "="*60)
    print("EXAMPLE 5: Export Operations")
    print("="*60 + "\n")

    formats = [
        ('stl', {'filename': 'part.stl', 'binary': True}),
        ('obj', {'filename': 'part.obj'}),
        ('gltf', {'filename': 'part.gltf'})
    ]

    for fmt, params in formats:
        print(f"Exporting to {fmt.upper()}:")
        r = client.execute(f'export.{fmt}', params)
        if r['ok']:
            print(f"  ✓ {r['result']['message']}")
            print(f"    Filename: {r['result']['filename']}\n")
        else:
            print(f"  ✗ Error: {r['error']}\n")


def example_server_info(client: CycleCADClient):
    """Example: Get server information."""
    print("\n" + "="*60)
    print("EXAMPLE 6: Server Information")
    print("="*60 + "\n")

    print("1. Health check:")
    health = client.get_health()
    print(f"   Status: {health['status']}")
    print(f"   Version: {health['version']}")
    print(f"   Uptime: {health['uptime']} seconds")
    print(f"   Commands available: {health['commands']}")
    print(f"   Commands executed: {health['commandsExecuted']}")
    print(f"   Session ID: {health['sessionId']}")

    print("\n2. API Schema (first 5 commands):")
    schema = client.get_schema()
    count = 0
    for namespace, data in schema['namespaces'].items():
        print(f"\n   Namespace: {namespace}")
        print(f"   {data.get('description', 'N/A')}")
        for cmd_name in list(data['commands'].keys())[:3]:
            cmd = data['commands'][cmd_name]
            print(f"     • {cmd['method']}")
            count += 1
            if count >= 5:
                break
        if count >= 5:
            break

    print(f"\n   ... and {schema['totalCommands'] - count} more commands")

    print("\n3. Command history (last 5 commands):")
    history = client.get_history(count=5)
    print(f"   Total executed: {history['total']}")
    for entry in history['recent']:
        status = '✓' if entry['ok'] else '✗'
        print(f"   [{status}] {entry['method']} ({entry['elapsed']}ms)")


def main():
    parser = argparse.ArgumentParser(
        description='cycleCAD API Client Example'
    )
    parser.add_argument('--host', default='localhost', help='Server host (default: localhost)')
    parser.add_argument('--port', type=int, default=3000, help='Server port (default: 3000)')
    parser.add_argument('--api-key', help='API key for authentication (optional)')
    parser.add_argument('--example', choices=[
        'all', 'simple', 'batch', 'query', 'view', 'export', 'info'
    ], default='all', help='Which example to run')

    args = parser.parse_args()

    print("\n" + "█"*60)
    print("█ cycleCAD API Client — Example Usage")
    print("█"*60)
    print(f"\nConnecting to {args.host}:{args.port}...")

    try:
        client = CycleCADClient(
            host=args.host,
            port=args.port,
            api_key=args.api_key
        )

        # Test connection
        health = client.get_health()
        print(f"✓ Connected to cycleCAD API v{health['version']}\n")

        # Run examples
        examples = {
            'all': [
                example_server_info,
                example_simple_part,
                example_batch_operations,
                example_query_and_validation,
                example_view_operations,
                example_export
            ],
            'simple': [example_simple_part],
            'batch': [example_batch_operations],
            'query': [example_query_and_validation],
            'view': [example_view_operations],
            'export': [example_export],
            'info': [example_server_info]
        }

        for example_fn in examples[args.example]:
            try:
                example_fn(client)
            except Exception as e:
                print(f"\n✗ Example failed: {e}")

        print("\n" + "█"*60)
        print("█ Examples completed!")
        print("█"*60 + "\n")

    except Exception as e:
        print(f"\n✗ Connection failed: {e}")
        print("\nMake sure the API server is running:")
        print(f"  npm run server  (from {args.host}:{args.port})")
        return 1

    return 0


if __name__ == '__main__':
    exit(main())
