import sys
from pathlib import Path
from lxml import etree
parser = etree.XMLParser(resolve_entities=False, no_network=True)
schema = etree.XMLSchema(etree.parse(str(Path(__file__).parent / 'schemas' / 'jpk' / sys.argv[1]), parser))
document = etree.fromstring(sys.stdin.buffer.read(), parser)
schema.assertValid(document)
