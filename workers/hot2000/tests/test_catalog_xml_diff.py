"""Tests for semantic H2K XML diff."""

from __future__ import annotations

import unittest

from catalog_xml_diff import assess_mapping_confidence, diff_h2k_xml


BASE_XML = """<?xml version="1.0"?>
<HouseFile>
  <ProgramInformation>
    <Weather>
      <Region code="5"><English>ONTARIO</English></Region>
      <Location code="274"><English>TORONTO</English></Location>
    </Weather>
  </ProgramInformation>
  <AllResults><Annual total="100"/></AllResults>
</HouseFile>
"""


class CatalogXmlDiffTests(unittest.TestCase):
    def test_attribute_change(self):
        after = BASE_XML.replace('code="5"', 'code="6"')
        result = diff_h2k_xml(BASE_XML, after)
        self.assertEqual(len(result.filtered_changes), 1)
        self.assertIn("@code", result.filtered_changes[0].path)
        self.assertEqual(assess_mapping_confidence(result.filtered_changes), "exact")

    def test_element_text_change(self):
        after = BASE_XML.replace("ONTARIO", "QUEBEC")
        result = diff_h2k_xml(BASE_XML, after)
        self.assertTrue(any(c.change_type == "text-changed" for c in result.filtered_changes))

    def test_element_added(self):
        after = BASE_XML.replace("</Weather>", "<Extra/></Weather>")
        result = diff_h2k_xml(BASE_XML, after)
        self.assertTrue(any(c.change_type == "element-added" for c in result.raw_changes))

    def test_element_removed(self):
        after = BASE_XML.replace("<Location code=\"274\"><English>TORONTO</English></Location>", "")
        result = diff_h2k_xml(BASE_XML, after)
        self.assertTrue(any(c.change_type == "element-removed" for c in result.raw_changes))

    def test_ignored_generated_path(self):
        after = BASE_XML.replace('total="100"', 'total="200"')
        result = diff_h2k_xml(BASE_XML, after)
        self.assertEqual(result.ignored_generated_changes, 1)
        self.assertEqual(len(result.filtered_changes), 0)

    def test_multiple_candidate_changes(self):
        after = BASE_XML.replace('code="5"', 'code="6"').replace('code="274"', 'code="275"')
        result = diff_h2k_xml(BASE_XML, after)
        self.assertGreaterEqual(len(result.filtered_changes), 2)
        self.assertIn(assess_mapping_confidence(result.filtered_changes), {"medium", "ambiguous"})

    def test_no_meaningful_change(self):
        result = diff_h2k_xml(BASE_XML, BASE_XML)
        self.assertEqual(len(result.filtered_changes), 0)
        self.assertEqual(assess_mapping_confidence(result.filtered_changes), "none")

    def test_whitespace_only_unchanged(self):
        spaced = BASE_XML.replace("<HouseFile>", "<HouseFile>\n  ")
        result = diff_h2k_xml(BASE_XML, spaced)
        self.assertEqual(len(result.filtered_changes), 0)


if __name__ == "__main__":
    unittest.main()
